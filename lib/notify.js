'use strict';

/**
 * Dispatcher für Benachrichtigungen: hört auf den Event-Bus und verteilt an
 *  - kanban.0.lastEvent (State, für Skript-Trigger)
 *  - E-Mail via sendTo(<emailInstance>, 'send', ...)
 *  - ausgehende Webhooks (HTTP POST, natives fetch, 5 s Timeout, 1 Retry)
 */

const { serverT } = require('./i18n-server');
const { buildDueAt } = require('./dueat');

const EVENT_TO_CONFIG = {
    cardAssigned: 'notifyAssigned',
    cardDue: 'notifyDue',
    cardCreated: 'notifyCreated',
    cardUpdated: 'notifyUpdated',
    cardMoved: 'notifyMoved',
    cardDone: 'notifyDone',
    cardDeleted: 'notifyDeleted',
    cardRestored: 'notifyRestored',
    cardPurged: 'notifyPurged',
};

// ------------------------------------------------------------ iCalendar (.ics)
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad2 = n => String(n).padStart(2, '0');
function icsStampUTC(dt) {
    return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}${pad2(dt.getUTCSeconds())}Z`;
}
function ymd(d) { return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; }

/**
 * Wandelt eine Wanduhr-Zeit in Zeitzone `tz` nach UTC – unabhängig davon, in
 * welcher Zeitzone der Node-Prozess läuft. Berücksichtigt DST, da Intl die
 * Zonenregeln kennt. (Kein externes date-fns/luxon nötig.)
 */
function zonedTimeToUtc(y, mo, d, hh, mm, tz) {
    const guessUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const map = {};
    for (const p of dtf.formatToParts(new Date(guessUtc))) if (p.type !== 'literal') map[p.type] = Number(p.value);
    const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
    return new Date(guessUtc - (asUtc - guessUtc));
}

// Wochentag 1..7 (Mo..So) → iCalendar-Kürzel
const ICS_DAYS = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };

/** Cron-Muster → RRULE, soweit der Kalenderstandard mitkommt. Abgedeckt sind die
 *  Fälle, die sich eins zu eins übersetzen lassen; alles Verschachtelte (Tag UND
 *  Wochentag, Schrittweiten quer über Felder) bleibt ein Einzeltermin. */
function cronRrule(expr) {
    const p = String(expr || '').trim().split(/\s+/);
    if (p.length !== 5) return '';
    const [, , dom, mon, dow] = p;
    const list = (spec, map) => {
        if (!/^[\d,\-]+$/.test(spec)) return null;
        const out = [];
        for (const part of spec.split(',')) {
            if (part.includes('-')) {
                const [a, b] = part.split('-').map(Number);
                if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) return null;
                for (let v = a; v <= b; v++) out.push(map ? map(v) : v);
            } else {
                const v = Number(part);
                if (!Number.isInteger(v)) return null;
                out.push(map ? map(v) : v);
            }
        }
        return out.filter(v => v !== undefined && v !== null);
    };
    const domAll = dom === '*';
    const dowAll = dow === '*';
    const monAll = mon === '*';

    if (domAll && dowAll && monAll) return 'RRULE:FREQ=DAILY';
    if (domAll && monAll && !dowAll) {
        const d = list(dow, v => ICS_DAYS[v % 7]);
        return d && d.length ? `RRULE:FREQ=WEEKLY;BYDAY=${d.join(',')}` : '';
    }
    if (dowAll && monAll && !domAll) {
        const d = list(dom);
        return d && d.length ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${d.join(',')}` : '';
    }
    if (dowAll && !monAll && !domAll) {
        const m = list(mon);
        const d = list(dom);
        return m && d && m.length && d.length
            ? `RRULE:FREQ=YEARLY;BYMONTH=${m.join(',')};BYMONTHDAY=${d.join(',')}` : '';
    }
    return '';
}

/**
 * Wiederholungsregel der Karte → RRULE. Gibt '' zurück, wenn sich die Regel nicht
 * abbilden lässt: „Arbeitstag im Monat" hängt an Feiertagen, die der Kalender-
 * standard nicht kennt – solche Karten bleiben Einzeltermine.
 */
function buildRrule(rec) {
    if (!rec || !rec.type || rec.type === 'none') return '';
    const days = (rec.dayOfWeek && rec.dayOfWeek.length ? rec.dayOfWeek : [1]).map(d => ICS_DAYS[d]).filter(Boolean);
    switch (rec.type) {
        case 'daily': return 'RRULE:FREQ=DAILY';
        case 'every_n_days': return `RRULE:FREQ=DAILY;INTERVAL=${Math.max(1, Number(rec.interval) || 1)}`;
        case 'weekly': return days.length ? `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}` : 'RRULE:FREQ=WEEKLY';
        case 'monthly': return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Math.min(31, Math.max(1, Number(rec.dayOfMonth) || 1))}`;
        case 'monthly_weekday': {
            const pos = Number(rec.ordinal) === -1 ? -1 : Math.min(4, Math.max(1, Number(rec.ordinal) || 1));
            return `RRULE:FREQ=MONTHLY;BYDAY=${days[0] || 'MO'};BYSETPOS=${pos}`;
        }
        case 'yearly':
            return `RRULE:FREQ=YEARLY;BYMONTH=${Math.min(12, Math.max(1, Number(rec.month) || 1))};BYMONTHDAY=${Math.min(31, Math.max(1, Number(rec.dayOfMonth) || 1))}`;
        case 'cron': return cronRrule(rec.cron);
        default: return '';   // workday: nicht abbildbar
    }
}

/**
 * Fingerabdruck der terminrelevanten Felder. Ändert er sich, geht eine
 * aktualisierte Einladung raus (gleiche UID, höhere SEQUENCE); sonst nicht.
 */
function icsFingerprint(card) {
    return JSON.stringify([card.due || '', card.dueTime || '', card.calendarDuration || '', card.recurrence || null]);
}

/** VEVENT aus einer Karte. dueTime → Termin mit Uhrzeit (Dauer aus calendarDuration,
 *  Standard 1 h), sonst ganztägig. Mit Wiederholung entsteht ein Serientermin. */
function buildIcs(card, tz) {
    const zone = tz || 'Europe/Berlin';
    const [y, m, d] = card.due.split('-');
    let dtStart, dtEnd;
    if (card.dueTime) {
        // Termin mit Uhrzeit: als Wanduhr-Zeit in der ermittelten Zeitzone
        // interpretieren und nach UTC (…Z) umrechnen → für jeden Empfänger eindeutig.
        const [hh, mm] = card.dueTime.split(':');
        const startUtc = zonedTimeToUtc(Number(y), Number(m), Number(d), Number(hh), Number(mm), zone);
        // Dauer der Karte (HH:MM, Standard 1 Stunde); 00:00 -> ebenfalls 1 Stunde
        const dur = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(card.calendarDuration || '01:00'));
        const durMin = dur ? (Number(dur[1]) * 60 + Number(dur[2])) : 60;
        const endUtc = new Date(startUtc.getTime() + (durMin > 0 ? durMin : 60) * 60 * 1000);
        dtStart = `DTSTART:${icsStampUTC(startUtc)}`;
        dtEnd = `DTEND:${icsStampUTC(endUtc)}`;
    } else {
        // Ganztägig: VALUE=DATE ist bewusst zeitzonenlos (Ende exklusiv = Folgetag)
        const next = new Date(Number(y), Number(m) - 1, Number(d) + 1);
        dtStart = `DTSTART;VALUE=DATE:${y}${m}${d}`;
        dtEnd = `DTEND;VALUE=DATE:${ymd(next)}`;
    }
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ioBroker//Kanban//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        // UID bleibt über die ganze Wiederholungskette gleich, damit der Kalender
        // die Folgekarten als denselben Serientermin erkennt.
        `UID:${card.icsUid || card.id}@kanban.iobroker`,
        `SEQUENCE:${Number(card.icsSeq) || 0}`,
        `DTSTAMP:${icsStampUTC(new Date())}`,
        dtStart, dtEnd,
        `SUMMARY:${icsEsc(card.title)}`,
    ];
    const rrule = buildRrule(card.recurrence);
    if (rrule) lines.push(rrule);
    if (card.description) lines.push(`DESCRIPTION:${icsEsc(card.description)}`);
    if (card.location) lines.push(`LOCATION:${icsEsc(card.location)}`);
    if (card.link) lines.push(`URL:${icsEsc(card.link)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
}

class Notifier {
    constructor(adapter, getBaseUrl, getTimezone) {
        this.adapter = adapter;
        this.getBaseUrl = getBaseUrl; // () => 'http://host:8095'
        this.getTimezone = getTimezone || (() => 'Europe/Berlin');
    }

    attach(bus) {
        bus.on('event', event => {
            this._dispatch(event).catch(e =>
                this.adapter.log.error(`Notification failed (${event.event}): ${e.message}`));
        });
    }

    async _dispatch(event) {
        // Fertigen Deep-Link zur Karte anhaengen (fuer lastEvent-Skripte und ausgehende Webhooks)
        if (event && event.board && event.board.id && event.card && event.card.id) {
            const base = this.getBaseUrl && this.getBaseUrl();
            if (base) event.link = `${base}/?board=${encodeURIComponent(event.board.id)}&card=${encodeURIComponent(event.card.id)}`;
        }
        // Fälligkeit inkl. Uhrzeit als kombiniertes Feld (lokaler Offset) mitgeben
        if (event && event.card) event.dueAt = buildDueAt(event.card, this.getTimezone && this.getTimezone());
        await this.adapter.setStateAsync('lastEvent', JSON.stringify(event), true);
        await Promise.allSettled([
            this._sendEmails(event),
            this._sendWebhooks(event),
        ]);
    }

    // ------------------------------------------------------------ E-Mail

    _userByName(name) {
        return (this.adapter.config.users || []).find(u => u.name === name);
    }

    // Will dieser Benutzer bei diesem Event-Typ benachrichtigt werden?
    // Eigene Einstellung sticht; ist sie nicht gesetzt, greift die globale Vorgabe.
    _userWants(u, flag) {
        if (!flag) return false;
        const v = u[flag];
        if (v === undefined || v === null || v === '') return !!this.adapter.config[flag];
        return !!v;
    }

    // Mitglieder des Boards; ohne Mitgliederliste ersatzweise die Zuständigen der Karte
    /**
     * Entscheidet, ob dieser Mail eine Kalender-Einladung beiliegt.
     * Rückgabe: { seq } zum Versenden, sonst null.
     */
    _icsDecision(event, card) {
        if (!card || !card.calendarInvite || !card.due) return null;
        if (event.detail && event.detail.recurrence) return null;   // Folgekarte einer Serie
        const fp = icsFingerprint(card);
        const changed = fp !== (card.icsFingerprint || '');
        const firstContact = event.event === 'cardCreated' || event.event === 'cardAssigned';
        if (!changed && !firstContact) return null;
        // Bei geändertem Termin die Sequenz erhöhen, damit Kalender den bestehenden
        // Eintrag aktualisieren statt einen zweiten anzulegen.
        const seq = changed && card.icsFingerprint ? (Number(card.icsSeq) || 0) + 1 : (Number(card.icsSeq) || 0);
        const store = this.adapter.store;
        if (store && store.markIcsSent && event.board) {
            try { store.markIcsSent(event.board.id, card.id, fp, seq); } catch (e) { /* ignore */ }
        }
        return { seq };
    }

    _boardMembers(event) {
        const store = this.adapter.store;
        const board = store && event.board && store.boards && store.boards.get(event.board.id);
        const members = board && Array.isArray(board.members) ? board.members : [];
        // Nur Mitglieder zaehlen, die es als Benutzer noch gibt: nach dem Umbenennen
        // einer Benutzer-ID stehen sonst tote Namen in der Liste und niemand bekommt Post.
        const known = new Set((this.adapter.config.users || []).map(u => u && u.name).filter(Boolean));
        const alive = members.filter(n => known.has(n));
        return alive.length ? alive : ((event.card && event.card.assignees) || []);
    }

    _recipientUsers(event) {
        // Zuweisung: nur der neu Zugewiesene
        // Neue Karte: alle Mitglieder des Boards, unabhängig von der Zuständigkeit
        // sonst: die Zuständigen der Karte
        let names;
        if (event.event === 'cardAssigned') names = [event.detail && event.detail.assignee].filter(Boolean);
        else if (event.event === 'cardCreated') names = this._boardMembers(event);
        else names = (event.card && event.card.assignees) || [];
        const seen = new Set();
        const users = [];
        for (const n of names) {
            const u = this._userByName(n);
            if (u && u.email && !seen.has(u.email)) { seen.add(u.email); users.push(u); }
        }
        return users;
    }

    async _sendEmails(event) {
        const cfg = this.adapter.config;
        const flag = EVENT_TO_CONFIG[event.event];
        if (!flag || !cfg.emailInstance) return;
        // Automatische Massenaktionen (Aufräumen/Purge) nicht pro Karte mailen –
        // sie werden über sendCleanupSummary gebündelt verschickt.
        if (event.detail && event.detail.auto) return;
        // Auslöser der Änderung nicht sich selbst benachrichtigen
        const by = (event.detail && event.detail.by) || null;
        const users = this._recipientUsers(event)
            .filter(u => u.name !== by)
            .filter(u => this._userWants(u, flag));
        if (!users.length) return;

        const lang = this.adapter._language;
        const label = serverT(lang, 'ev.' + event.event);
        const card = event.card || {};
        const subject = `${serverT(lang, 'mail.subjectPrefix')} ${label}: ${card.title || ''}`;
        const html = this._renderHtml(event, label);

        // Optionaler Kalender-Anhang (.ics), wenn an der Karte aktiviert + Datum vorhanden.
        // Bei Serienterminen soll die Einladung nur EINMAL kommen: neu angelegte oder
        // frisch zugewiesene Karten bekommen sie, Folgekarten einer Wiederholung nicht
        // (die Serie liegt beim Empfänger schon im Kalender), und eine Aktualisierung
        // nur, wenn sich Fälligkeit, Uhrzeit, Dauer oder Wiederholungsregel geändert haben.
        let attachments;
        const icsInfo = this._icsDecision(event, card);
        if (icsInfo) {
            attachments = [{
                filename: 'termin.ics',
                content: buildIcs({ ...card, icsSeq: icsInfo.seq }, this.getTimezone()),
                contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            }];
        }

        for (const u of users) {
            this.adapter.sendTo(cfg.emailInstance, 'send', {
                to: u.email,
                from: cfg.emailFrom || undefined,
                subject,
                html,
                ...(attachments ? { attachments } : {}),
            });
        }
        this.adapter.log.debug(`E-mail '${subject}' to ${users.map(u => u.email).join(', ')}${attachments ? ' (+ .ics)' : ''}`);
    }

    _renderHtml(event, label) {
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const card = event.card || {};
        const board = event.board || {};
        const accent = this.adapter.config.accentColor || '#7E57C2';
        const lang = this.adapter._language;
        const rows = [];
        rows.push([serverT(lang, 'mail.board'), esc(board.title)]);
        if (event.detail && event.detail.fromColumn && event.detail.toColumn) {
            rows.push([serverT(lang, 'mail.moved'), `${esc(event.detail.fromColumn)} → ${esc(event.detail.toColumn)}`]);
        }
        if (card.due) rows.push([serverT(lang, 'mail.due'), esc(card.due)]);
        if (card.assignees && card.assignees.length) {
            const names = card.assignees.map(n => {
                const u = this._userByName(n);
                return esc(u ? u.displayName : n);
            });
            rows.push([serverT(lang, 'mail.assignees'), names.join(', ')]);
        }
        if (event.detail && event.detail.by) rows.push([serverT(lang, 'mail.by'), esc(event.detail.by)]);
        if (card.description) rows.push([serverT(lang, 'mail.description'), esc(card.description).slice(0, 500)]);

        const base = this.getBaseUrl();
        // Link-Ziel je Board: 'url' = feste eigene Adresse, 'edit' = Karten-Editor, sonst Board-Ansicht (Karte hervorgehoben)
        const attr = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let href = '';
        if (board.linkTarget === 'url' && board.linkUrl) {
            href = board.linkUrl;
        } else if (base && board.id && card.id) {
            const key = board.linkTarget === 'edit' ? 'card' : 'focus';
            href = `${base}/?board=${encodeURIComponent(board.id)}&${key}=${encodeURIComponent(card.id)}`;
        }
        const link = href
            ? `<p><a href="${attr(href)}" style="color:${accent}">${serverT(lang, 'mail.openCard')}</a></p>`
            : '';

        return `<div style="font-family:sans-serif;max-width:560px">
<h2 style="color:${accent};margin-bottom:4px">${esc(label)}</h2>
<h3 style="margin-top:0">${esc(card.title)}</h3>
<table style="border-collapse:collapse">${rows.map(([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#777">${k}</td><td style="padding:2px 0">${v}</td></tr>`).join('')}
</table>
${link}
<p style="color:#999;font-size:12px">ioBroker Kanban · ${esc(event.ts)}</p>
</div>`;
    }

    /**
     * Gebündelte E-Mail-Zusammenfassung eines Aufräumlaufs: pro Benutzer eine Mail
     * mit allen betroffenen Karten (statt einer Mail je Karte). moved = in den
     * Papierkorb verschoben (notifyDeleted), purged = endgültig entfernt (notifyPurged).
     */
    async sendCleanupSummary(results) {
        const cfg = this.adapter.config;
        if (!cfg.emailInstance || !Array.isArray(results) || !results.length) return;
        const lang = this.adapter._language;
        const perUser = new Map();   // email -> { user, boards: Map<title,{moved,purged}> }
        const add = (u, boardTitle, kind, card) => {
            if (!u || !u.email) return;
            let e = perUser.get(u.email);
            if (!e) { e = { user: u, boards: new Map() }; perUser.set(u.email, e); }
            let b = e.boards.get(boardTitle);
            if (!b) { b = { moved: [], purged: [] }; e.boards.set(boardTitle, b); }
            b[kind].push(card);
        };
        for (const r of results) {
            const boardTitle = r.board.title;
            for (const card of r.moved) {
                for (const name of (card.assignees || [])) {
                    const u = this._userByName(name);
                    if (u && this._userWants(u, 'notifyDeleted')) add(u, boardTitle, 'moved', card);
                }
            }
            for (const card of r.purged) {
                for (const name of (card.assignees || [])) {
                    const u = this._userByName(name);
                    if (u && this._userWants(u, 'notifyPurged')) add(u, boardTitle, 'purged', card);
                }
            }
        }
        const subject = `${serverT(lang, 'mail.subjectPrefix')} ${serverT(lang, 'mail.cleanupSubject')}`;
        for (const { user, boards } of perUser.values()) {
            this.adapter.sendTo(cfg.emailInstance, 'send', {
                to: user.email,
                from: cfg.emailFrom || undefined,
                subject,
                html: this._renderCleanupHtml(boards, lang),
            });
        }
        if (perUser.size) this.adapter.log.debug(`Cleanup summary to ${perUser.size} recipient(s)`);
    }

    _renderCleanupHtml(boards, lang) {
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const accent = this.adapter.config.accentColor || '#7E57C2';
        let out = '<div style="font-family:sans-serif;max-width:560px">';
        for (const [boardTitle, g] of boards) {
            out += `<h3 style="color:${accent};margin-bottom:4px">${esc(boardTitle)}</h3>`;
            if (g.moved.length) {
                out += `<p style="margin:4px 0;color:#555">${esc(serverT(lang, 'mail.cleanupIntro'))}</p><ul>`
                    + g.moved.map(c => `<li>${esc(c.title)}</li>`).join('') + '</ul>';
            }
            if (g.purged.length) {
                out += `<p style="margin:4px 0;color:#555">${esc(serverT(lang, 'mail.purgedIntro'))}</p><ul>`
                    + g.purged.map(c => `<li>${esc(c.title)}</li>`).join('') + '</ul>';
            }
        }
        out += '<p style="color:#999;font-size:12px">ioBroker Kanban</p></div>';
        return out;
    }

    // ------------------------------------------------------------ Webhooks ausgehend

    async _sendWebhooks(event) {
        const hooks = (this.adapter.config.outboundWebhooks || []).filter(h =>
            h && h.enabled !== false && h.url && this._matchesEvents(h.events, event.event));
        for (const hook of hooks) {
            this._post(hook, event).catch(e =>
                this.adapter.log.warn(`Webhook '${hook.name || hook.url}' failed: ${e.message}`));
        }
    }

    _matchesEvents(eventsCfg, type) {
        const s = String(eventsCfg || '*').trim();
        if (!s || s === '*') return true;
        return s.split(/[\s,;]+/).includes(type);
    }

    async _post(hook, event, isRetry) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(hook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.adapter.log.debug(`Webhook '${hook.name || hook.url}' -> ${event.event} OK`);
        } catch (e) {
            if (!isRetry) {
                await new Promise(r => setTimeout(r, 2000));
                return this._post(hook, event, true);
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }
}

module.exports = { Notifier, buildIcs, buildRrule, icsFingerprint };
