'use strict';

/**
 * Fünffeldriger Cron-Ausdruck als Wiederholungsmuster: `Minute Stunde Tag Monat Wochentag`.
 *
 * Der Adapter plant damit nichts — er sucht damit das nächste Fälligkeitsdatum einer
 * wiederkehrenden Karte. Minute und Stunde legen die Uhrzeit der Folgekarte fest, die
 * drei Datumsfelder entscheiden, welcher Tag passt.
 *
 * Unterstützt je Feld: `*`, Zahl, Liste (`1,15`), Bereich (`1-5`), Schrittweite
 * (Stern plus `/3`, oder `1-7/2`) sowie die englischen Kurznamen für Monat und Wochentag.
 * Sonntag ist 0 und 7. Nicht unterstützt: `L`, `W`, `#`, `?` — diese Erweiterungen
 * kennt nicht einmal jeder Cron, und ihre Fälle deckt der Adapter mit eigenen
 * Wiederholungstypen ab (n-ter Wochentag, Arbeitstag im Monat).
 */

const FIELDS = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'dayOfMonth', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'dayOfWeek', min: 0, max: 7 },
];

/** Obergrenze fuer die Laenge eines Ausdrucks (siehe parseCron). */
const MAX_EXPR_LENGTH = 120;

const MONTH_NAMES = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};
const DAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function namedValue(token, fieldName) {
    const key = String(token).toLowerCase();
    if (fieldName === 'month' && MONTH_NAMES[key] !== undefined) {
        return MONTH_NAMES[key];
    }
    if (fieldName === 'dayOfWeek' && DAY_NAMES[key] !== undefined) {
        return DAY_NAMES[key];
    }
    return null;
}

/**
 * Ein Feld in die Menge der erlaubten Zahlen auflösen. Wirft bei Unsinn.
 *
 * @param raw
 * @param field
 */
function parseField(raw, field) {
    const spec = String(raw || '').trim();
    if (!spec) {
        throw new Error(`${field.name}: leer`);
    }
    const out = new Set();

    for (const part of spec.split(',')) {
        const piece = part.trim();
        if (!piece) {
            throw new Error(`${field.name}: leerer Listeneintrag in '${spec}'`);
        }

        const [rangePart, stepPart] = piece.split('/');
        let step = 1;
        if (stepPart !== undefined) {
            step = Number(stepPart);
            if (!Number.isInteger(step) || step < 1) {
                throw new Error(`${field.name}: ungültige Schrittweite '${stepPart}'`);
            }
        }

        let from;
        let to;
        if (rangePart === '*') {
            from = field.min;
            to = field.max;
        } else if (rangePart.includes('-')) {
            const [a, b] = rangePart.split('-');
            from = namedValue(a, field.name);
            if (from === null) {
                from = Number(a);
            }
            to = namedValue(b, field.name);
            if (to === null) {
                to = Number(b);
            }
        } else {
            from = namedValue(rangePart, field.name);
            if (from === null) {
                from = Number(rangePart);
            }
            to = stepPart !== undefined ? field.max : from;
        }

        if (!Number.isInteger(from) || !Number.isInteger(to)) {
            throw new Error(`${field.name}: '${piece}' ist keine gültige Angabe`);
        }
        if (from < field.min || to > field.max || from > to) {
            throw new Error(`${field.name}: '${piece}' liegt außerhalb von ${field.min}-${field.max}`);
        }
        for (let v = from; v <= to; v += step) {
            out.add(v);
        }
    }

    // Sonntag darf 0 oder 7 heißen — intern immer 0
    if (field.name === 'dayOfWeek' && out.has(7)) {
        out.delete(7);
        out.add(0);
    }
    return out;
}

/**
 * Cron-Ausdruck zerlegen.
 *
 * @param expr
 * @returns {{minute:Set, hour:Set, dayOfMonth:Set, month:Set, dayOfWeek:Set,
 *            domRestricted:boolean, dowRestricted:boolean, time:string, expr:string}}
 * @throws {Error} mit einer Meldung, die sich direkt anzeigen lässt
 */
function parseCron(expr) {
    const raw = String(expr || '').trim();
    // Laengendeckel: firstDue/nextDue rufen den Parser fuer jedes Kandidatendatum
    // erneut auf (bis zu 801 Tage). Ohne Deckel blockiert ein kilobytegrosser
    // Ausdruck ueber die token-freie Pruefroute den Event-Loop fuer Sekunden.
    // Das laengste sinnvolle Muster (alle Monatsnamen) bleibt weit darunter.
    if (raw.length > MAX_EXPR_LENGTH) {
        throw new Error(`Ausdruck zu lang (höchstens ${MAX_EXPR_LENGTH} Zeichen)`);
    }
    const parts = raw.split(/\s+/);
    if (parts.length !== 5) {
        throw new Error(
            `Cron braucht fünf Felder (Minute Stunde Tag Monat Wochentag), gefunden: ${parts.filter(Boolean).length}`,
        );
    }
    const parsed = {};
    FIELDS.forEach((field, i) => {
        parsed[field.name] = parseField(parts[i], field);
    });

    // Cron-Eigenheit: Sind Tag UND Wochentag eingeschränkt, gilt ODER, nicht UND.
    parsed.domRestricted = parts[2].trim() !== '*';
    parsed.dowRestricted = parts[4].trim() !== '*';

    // Uhrzeit der Folgekarte: die früheste im Muster genannte
    const hour = Math.min(...parsed.hour);
    const minute = Math.min(...parsed.minute);
    parsed.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    parsed.expr = parts.join(' ');
    return parsed;
}

/**
 * Passt ein Datum (Date) auf das Muster? Nur die drei Datumsfelder zählen.
 *
 * @param parsed
 * @param d
 */
function cronMatchesDate(parsed, d) {
    if (!parsed.month.has(d.getMonth() + 1)) {
        return false;
    }
    const dom = parsed.dayOfMonth.has(d.getDate());
    const dow = parsed.dayOfWeek.has(d.getDay());
    if (parsed.domRestricted && parsed.dowRestricted) {
        return dom || dow;
    }
    if (parsed.domRestricted) {
        return dom;
    }
    if (parsed.dowRestricted) {
        return dow;
    }
    return true;
}

/**
 * Gültig? Liefert { ok:true, time } oder { ok:false, error }.
 *
 * @param expr
 */
function validateCron(expr) {
    try {
        const p = parseCron(expr);
        return { ok: true, time: p.time };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = { parseCron, cronMatchesDate, validateCron };
