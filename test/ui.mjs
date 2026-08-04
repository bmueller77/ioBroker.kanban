import assert from 'node:assert/strict';
import { absoluteOrder, boardMembers } from '../www/js/board.js';

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
