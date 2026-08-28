import assert from 'node:assert/strict';
import { absoluteOrder, boardMembers, countDues, dueState, getCountModes } from '../www/js/board.js';

/**
 * Reine Hilfsfunktionen der Oberfläche — ohne Browser prüfbar.
 * Beide gehören zu Befunden, die nur unter Filtern bzw. bei fremden Boards auftraten.
 */

/** Karte im Board-State */
const card = (id, order, columnId = 'todo') => ({ id, order, columnId });
/** Nachgebaute DOM-Liste: SortableJS liefert die Karte bereits einsortiert. */
const list = (...ids) => ({ children: ids.map(id => ({ dataset: { cardId: id } })) });

describe('Drag & Drop: sichtbarer Index in die volle Spaltenordnung', () => {
    // Spalte mit fünf Karten, von denen ein Filter nur a, c und e zeigt
    const board = {
        cards: [card('a', 0), card('b', 1), card('c', 2), card('d', 3), card('e', 4)],
    };

    it('ordnet vor die nächste sichtbare Karte ein', () => {
        // gezogen wird 'e', abgelegt zwischen den sichtbaren 'a' und 'c'
        const dom = list('a', 'e', 'c');
        // Ohne Umrechnung würde 1 gesendet und 'e' landete zwischen a und b.
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 1), 2);
    });

    it('ordnet hinter die vorherige sichtbare Karte ein, wenn keine folgt', () => {
        const dom = list('a', 'c', 'e');
        // 'e' hinter 'c': in der vollen Liste (ohne e) steht c an Position 2
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 2), 3);
    });

    it('legt ganz oben ab, wenn die Karte vor allem Sichtbaren landet', () => {
        const dom = list('e', 'a', 'c');
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 0), 0);
    });

    it('bleibt ohne Filter beim gewohnten Ergebnis', () => {
        const dom = list('a', 'b', 'e', 'c', 'd');
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 2), 2);
        assert.equal(absoluteOrder(board, 'todo', 'e', list('e', 'a', 'b', 'c', 'd'), 0), 0);
        assert.equal(absoluteOrder(board, 'todo', 'e', list('a', 'b', 'c', 'd', 'e'), 4), 4);
    });

    it('kommt mit einer leeren Zielspalte zurecht', () => {
        assert.equal(absoluteOrder(board, 'leer', 'e', list('e'), 0), 0);
    });

    it('ignoriert Fremdelemente in der Liste, etwa den Hinweis „+X weitere"', () => {
        const dom = { children: [{ dataset: { cardId: 'a' } }, { dataset: {} }, { dataset: { cardId: 'e' } }] };
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 1), 1);
    });
});

describe('Wirksame Board-Mitglieder', () => {
    const users = [{ name: 'anna' }, { name: 'ben' }, { name: 'carla' }];

    it('nimmt die genannten Mitglieder', () => {
        assert.deepEqual(boardMembers({ members: ['anna', 'carla'] }, users), ['anna', 'carla']);
    });

    it('behandelt eine leere Liste als alle', () => {
        assert.deepEqual(boardMembers({ members: [] }, users), ['anna', 'ben', 'carla']);
        assert.deepEqual(boardMembers({}, users), ['anna', 'ben', 'carla']);
    });

    it('behandelt eine ins Leere zeigende Liste als alle', () => {
        // Regression: Der Übertragen-Dialog las die Liste roh — ein per API
        // angelegtes Board galt damit als „niemand zuweisbar" und der Dialog
        // ließ sich nicht mehr bestätigen.
        assert.deepEqual(boardMembers({ members: ['umbenannt'] }, users), ['anna', 'ben', 'carla']);
    });

    it('lässt unbekannte Namen aus einer sonst gültigen Liste weg', () => {
        assert.deepEqual(boardMembers({ members: ['anna', 'weg'] }, users), ['anna']);
    });
});

/**
 * Datum als YYYY-MM-DD, um n Tage verschoben.
 *
 * @param n Verschiebung in Tagen
 * @returns Datum als Zeichenkette
 */
function tag(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Fälligkeit: dreistufige Einfärbung', () => {
    // Vorgabe der Instanz: einen Tag vorher erinnern
    const cfg = { reminderDaysBefore: 1 };

    it('färbt Vergangenes als überfällig', () => {
        assert.equal(dueState(tag(-1), '', cfg), 'overdue');
    });

    it('trennt heute von morgen', () => {
        // Genau der Punkt aus dem Forum: beides war vorher orange
        assert.equal(dueState(tag(0), '', cfg), 'today');
        assert.equal(dueState(tag(1), '', cfg), 'soon');
    });

    it('lässt später Fälliges ungefärbt', () => {
        assert.equal(dueState(tag(2), '', cfg), '');
    });

    it('folgt der eingestellten Vorlaufzeit', () => {
        assert.equal(dueState(tag(3), '', { reminderDaysBefore: 3 }), 'soon');
        assert.equal(dueState(tag(4), '', { reminderDaysBefore: 3 }), '');
        // Vorlauf 0: nur heute und Vergangenes sind gefärbt
        assert.equal(dueState(tag(1), '', { reminderDaysBefore: 0 }), '');
    });

    it('nimmt ohne Angabe einen Tag Vorlauf an', () => {
        assert.equal(dueState(tag(1), '', {}), 'soon');
        assert.equal(dueState(tag(1), '', undefined), 'soon');
    });

    it('zählt die Uhrzeit, sobald sie verstrichen ist', () => {
        // Eine Karte, die heute um 00:01 fällig war, ist mittags vorbei
        assert.equal(dueState(tag(0), '00:01', cfg), 'overdue');
        // Eine um 23:59 noch nicht
        assert.equal(dueState(tag(0), '23:59', cfg), 'today');
    });

    it('ignoriert eine unbrauchbare Uhrzeit, statt zu raten', () => {
        assert.equal(dueState(tag(0), 'kaputt', cfg), 'today');
    });

    it('gibt für Karten ohne Datum nichts zurück', () => {
        assert.equal(dueState('', '', cfg), '');
    });
});

describe('Kopfzahlen der Spalten', () => {
    const cfg = { reminderDaysBefore: 1 };
    const board = { id: 'familie' };
    const col = { id: 'todo' };

    it('zählt je Fälligkeitsstufe', () => {
        const liste = [`${tag(-3)}|`, `${tag(-1)}|`, `${tag(0)}|`, `${tag(1)}|`, `${tag(9)}|`];
        assert.deepEqual(countDues(liste, cfg), { soon: 1, today: 1, overdue: 2 });
    });

    it('lässt später Fälliges aus jeder Stufe heraus', () => {
        assert.deepEqual(countDues([`${tag(5)}|`, `${tag(30)}|`], cfg), { soon: 0, today: 0, overdue: 0 });
    });

    it('folgt der Vorlaufzeit der Instanz', () => {
        const liste = [`${tag(2)}|`, `${tag(3)}|`];
        assert.equal(countDues(liste, { reminderDaysBefore: 3 }).soon, 2);
        assert.equal(countDues(liste, cfg).soon, 0);
    });

    it('wertet die Uhrzeit mit aus', () => {
        assert.equal(countDues([`${tag(0)}|00:01`], cfg).overdue, 1);
        assert.equal(countDues([`${tag(0)}|23:59`], cfg).today, 1);
    });

    it('stolpert nicht über leere Einträge', () => {
        // Ohne fällige Karte steht im data-Attribut ein leerer String, den
        // split(',') zu [''] macht.
        assert.deepEqual(countDues([''], cfg), { soon: 0, today: 0, overdue: 0 });
    });

    it('zeigt ohne Einstellung nur die Gesamtzahl', () => {
        assert.deepEqual(getCountModes({}, board, col), ['total']);
        assert.deepEqual(getCountModes({ countModes: {} }, board, col), ['total']);
    });

    it('merkt sich die Auswahl je Board und Spalte', () => {
        const state = { countModes: { 'familie:todo': ['total', 'overdue'] } };
        assert.deepEqual(getCountModes(state, board, col), ['total', 'overdue']);
        // andere Spalte, andere Einstellung
        assert.deepEqual(getCountModes(state, board, { id: 'doing' }), ['total']);
    });

    it('bringt die Auswahl in die Reihenfolge der Anzeige', () => {
        const state = { countModes: { 'familie:todo': ['overdue', 'total', 'soon'] } };
        assert.deepEqual(getCountModes(state, board, col), ['total', 'soon', 'overdue']);
    });

    it('fällt bei unbrauchbarem Inhalt auf die Gesamtzahl zurück', () => {
        assert.deepEqual(getCountModes({ countModes: { 'familie:todo': ['quatsch'] } }, board, col), ['total']);
        assert.deepEqual(getCountModes({ countModes: { 'familie:todo': 'total' } }, board, col), ['total']);
    });
});
