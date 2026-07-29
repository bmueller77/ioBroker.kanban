'use strict';

/**
 * Fälligkeit als ISO-Zeitstempel mit lokalem Offset (`dueAt`).
 *
 * Karten speichern die Fälligkeit getrennt als `due` (YYYY-MM-DD) und optional
 * `dueTime` (HH:MM). Für Automatisierungen ist ein einzelner, eindeutiger
 * Zeitstempel praktischer – den liefern die Ereignisse und (seit 0.3.0) auch
 * die REST-API in jedem Kartenobjekt. Berechnet, nicht gespeichert.
 */

// Offset (Minuten) der Zeitzone tz zum Zeitpunkt date.
function tzOffsetMinutes(date, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const map = {};
    for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value);
    const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
    return Math.round((asUtc - date.getTime()) / 60000);
}

// Kombiniert Fälligkeitsdatum + Uhrzeit zu einem ISO-String mit lokalem Offset.
// Ohne Uhrzeit wird 00:00 angenommen. Gibt null zurück, wenn kein Datum vorliegt.
function buildDueAt(card, tz) {
    if (!card || !card.due) return null;
    const zone = tz || 'Europe/Berlin';
    const [y, mo, d] = card.due.split('-').map(Number);
    const [hh, mm] = (card.dueTime || '00:00').split(':').map(Number);
    const guessUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);
    const off = tzOffsetMinutes(new Date(guessUtc), zone);
    const p2 = n => String(Math.abs(n)).padStart(2, '0');
    const sign = off >= 0 ? '+' : '-';
    const offStr = `${sign}${p2(Math.trunc(off / 60))}:${p2(off % 60)}`;
    return `${card.due}T${p2(hh)}:${p2(mm)}:00${offStr}`;
}

/** Kartenobjekt für die Ausgabe: flache Kopie mit berechnetem dueAt. */
function cardWithDueAt(card, tz) {
    if (!card || typeof card !== 'object') return card;
    return { ...card, dueAt: buildDueAt(card, tz) };
}

/** Board-Objekt für die Ausgabe: Karten mit dueAt, Original bleibt unberührt. */
function boardWithDueAt(board, tz) {
    if (!board || !Array.isArray(board.cards)) return board;
    return { ...board, cards: board.cards.map(c => cardWithDueAt(c, tz)) };
}

module.exports = { tzOffsetMinutes, buildDueAt, cardWithDueAt, boardWithDueAt };
