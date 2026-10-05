import assert from 'node:assert/strict';
import { templateFromCard, templateFromImport } from '../www/js/dialogs.js';

/**
 * Die beiden Umrechnungen der Kartenvorlagen in der Oberflaeche: Karte zu
 * Vorlage und eingelesene Vorlage zu Vorlage dieses Boards. Beide sind rein und
 * damit ohne Browser pruefbar; in ihnen stecken die Regeln, die beim Benutzen
 * zaehlen.
 */

const KARTE = {
    title: 'Filterwechsel',
    description: 'Filter der Lüftung tauschen',
    assignees: ['anna'],
    due: '2026-01-15',
    dueTime: '09:00',
    labels: ['lbl_wartung'],
    color: '#4CAF50',
    priority: 2,
    checklist: [{ text: 'Filter bestellen', done: true }, { text: 'Alten entsorgen', done: false }],
    link: 'https://example.org',
    location: 'Keller',
    calendarInvite: true,
    calendarDuration: '00:30',
    recurrence: { type: 'every_n_days', interval: 30, startDate: '2026-01-01' },
};

describe('Karte zu Vorlage', () => {
    it('nimmt kein Faelligkeitsdatum mit', () => {
        const t = templateFromCard(KARTE, 'Filterwechsel');
        assert.equal(t.due, undefined, 'ein festes Datum wuerde altern');
    });

    it('setzt die Haken zurueck, behaelt die Punkte', () => {
        const t = templateFromCard(KARTE, 'Filterwechsel');
        assert.deepEqual(
            t.checklist,
            [{ text: 'Filter bestellen', done: false }, { text: 'Alten entsorgen', done: false }],
        );
    });

    it('behaelt die Uhrzeit', () => {
        // 17:00 ist eine Eigenschaft der Aufgabe und altert nicht, anders als ein Datum.
        assert.equal(templateFromCard(KARTE, 'x').dueTime, '09:00');
    });

    it('nimmt die uebrigen Felder mit', () => {
        const t = templateFromCard(KARTE, 'Filterwechsel');
        assert.deepEqual(t.assignees, ['anna']);
        assert.deepEqual(t.labels, ['lbl_wartung']);
        assert.equal(t.priority, 2);
        assert.equal(t.location, 'Keller');
        assert.equal(t.link, 'https://example.org');
        assert.equal(t.calendarInvite, true);
        assert.equal(t.calendarDuration, '00:30');
        assert.equal(t.recurrence.type, 'every_n_days');
    });

    it('nimmt den Namen als Titel, wenn die Karte keinen hat', () => {
        assert.equal(templateFromCard({}, 'Wartung').title, 'Wartung');
    });

    it('traegt die ID nur, wenn eine ersetzt wird', () => {
        assert.equal('id' in templateFromCard(KARTE, 'x'), false);
        assert.equal(templateFromCard(KARTE, 'x', 'tpl_alt').id, 'tpl_alt');
    });

    it('kopiert die Listen, statt sie zu teilen', () => {
        const t = templateFromCard(KARTE, 'x');
        t.labels.push('lbl_neu');
        assert.deepEqual(KARTE.labels, ['lbl_wartung'], 'die Karte darf sich nicht mitaendern');
    });
});

describe('Eingelesene Vorlage fuer dieses Board', () => {
    const labelNachName = new Map([['wartung', 'lbl_w'], ['haus', 'lbl_h']]);
    const ids = () => {
        let n = 0;
        return () => `tpl_test${++n}`;
    };

    it('ordnet Labels ueber den Namen zu, kleingeschrieben verglichen', () => {
        const r = templateFromImport(
            { name: 'A', labelNames: ['Wartung', 'HAUS'] },
            labelNachName,
            new Set(),
            ids(),
        );
        assert.deepEqual(r.tpl.labels, ['lbl_w', 'lbl_h']);
        assert.equal(r.labelsWeg, 0);
    });

    it('laesst ein unbekanntes Label weg und zaehlt es', () => {
        const r = templateFromImport(
            { name: 'A', labelNames: ['Wartung', 'Gibtsnicht'] },
            labelNachName,
            new Set(),
            ids(),
        );
        assert.deepEqual(r.tpl.labels, ['lbl_w']);
        assert.equal(r.labelsWeg, 1, 'ein Import legt auf dem Zielboard keine Labels an');
    });

    it('haengt einen Zaehler an, wenn der Name schon vergeben ist', () => {
        const vergeben = new Set(['filterwechsel']);
        const r = templateFromImport({ name: 'Filterwechsel' }, labelNachName, vergeben, ids());
        assert.equal(r.tpl.name, 'Filterwechsel (2)');
        assert.equal(r.umbenannt, true);
    });

    it('zaehlt weiter, wenn auch der Zaehlername vergeben ist', () => {
        const vergeben = new Set(['a', 'a (2)', 'a (3)']);
        const r = templateFromImport({ name: 'A' }, labelNachName, vergeben, ids());
        assert.equal(r.tpl.name, 'A (4)');
    });

    it('merkt sich den vergebenen Namen fuer den naechsten Eintrag', () => {
        const vergeben = new Set();
        const neu = ids();
        const a = templateFromImport({ name: 'Doppelt' }, labelNachName, vergeben, neu);
        const b = templateFromImport({ name: 'Doppelt' }, labelNachName, vergeben, neu);
        assert.equal(a.tpl.name, 'Doppelt');
        assert.equal(b.tpl.name, 'Doppelt (2)', 'zwei gleiche in derselben Datei');
    });

    it('vergibt eine frische ID', () => {
        const r = templateFromImport({ name: 'A', id: 'tpl_aus_der_datei' }, labelNachName, new Set(), ids());
        assert.equal(r.tpl.id, 'tpl_test1', 'sonst scheitert das zweite Einlesen derselben Datei');
    });

    it('setzt die Haken zurueck', () => {
        const r = templateFromImport(
            { name: 'A', checklist: [{ text: 'Eins', done: true }] },
            labelNachName,
            new Set(),
            ids(),
        );
        assert.deepEqual(r.tpl.checklist, [{ text: 'Eins', done: false }]);
    });

    it('wirft weg, was nicht in eine Vorlage gehoert', () => {
        const r = templateFromImport(
            { name: 'A', due: '2026-01-01', columnId: 'todo', unfug: 1 },
            labelNachName,
            new Set(),
            ids(),
        );
        assert.equal(r.tpl.due, undefined);
        assert.equal(r.tpl.columnId, undefined);
        assert.equal(r.tpl.unfug, undefined);
    });

    it('nimmt eine Wiederholung nur mit Typ', () => {
        const mit = templateFromImport(
            { name: 'A', recurrence: { type: 'weekly', dayOfWeek: [1] } },
            labelNachName,
            new Set(),
            ids(),
        );
        const ohne = templateFromImport({ name: 'B', recurrence: { interval: 3 } }, labelNachName, new Set(), ids());
        assert.equal(mit.tpl.recurrence.type, 'weekly');
        assert.equal(ohne.tpl.recurrence, null);
    });
});
