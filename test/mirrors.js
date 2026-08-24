const assert = require('node:assert/strict');
const { Store } = require('../lib/store');

/**
 * Spiegel-States: Die Board-Zaehler haengen nicht nur an Aenderungen, sondern
 * auch am Kalendertag. Eine Karte wird ueberfaellig, ohne dass jemand das Board
 * anfasst - der Zaehler muss trotzdem nachziehen.
 */

/**
 * Store mit einem Adapter, der jedes geschriebene State-Paar mitschreibt.
 *
 * @returns Store und die Sammlung der geschriebenen States
 */
function newStore() {
    const states = {};
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users: [{ name: 'anna' }] },
        log: { warn() {}, info() {}, error() {}, debug() {} },
        setObjectNotExistsAsync: async () => {},
        setStateAsync: async (id, val) => { states[id] = val; },
        setStateChangedAsync: async (id, val) => { states[id] = val; },
        getStateAsync: async () => null,
        delObjectAsync: async () => {},
    };
    const store = new Store(adapter, { emitEvent() {} });
    store._schedulePersist = () => {};
    return { store, states };
}

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

describe('Spiegel-States: Board-Zaehler', () => {
    it('zaehlt eine ueberfaellige Karte, ohne dass das Board geaendert wurde', async () => {
        // Regression: updateMirrors() frischte nur die Benutzer-States auf. Die
        // Board-Zaehler schrieb allein _persist(), also nur bei einer Aenderung.
        // Auf einem unberuehrten Board blieb overdueCount deshalb stehen.
        const { store, states } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Gestern faellig', columnId: 'todo', due: tag(-1) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 1);
        assert.equal(states['boards.b.cardCount'], 1);
    });

    it('laesst erledigte Karten und den Papierkorb aussen vor', async () => {
        const { store, states } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const done = store.addCard('b', { title: 'Erledigt', columnId: 'todo', due: tag(-1) }, 'test');
        store.moveCard('b', done.id, 'done', 0, 'test');
        const weg = store.addCard('b', { title: 'Papierkorb', columnId: 'todo', due: tag(-1) }, 'test');
        store.deleteCard('b', weg.id, 'test');
        store.addCard('b', { title: 'Offen', columnId: 'todo', due: tag(-1) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 1);
    });

    it('zaehlt heute faellige Karten nicht als ueberfaellig', async () => {
        const { store, states } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Heute', columnId: 'todo', due: tag(0) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 0);
    });
});
