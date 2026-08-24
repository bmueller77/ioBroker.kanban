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

describe('Verwaiste Zuständige', () => {
    it('findet Zuständige, die es als Benutzer nicht mehr gibt', async () => {
        // Regression: Wird eine Benutzer-ID umbenannt, zeigen die Karten ins
        // Leere - sie speichern die ID, nicht den Anzeigenamen.
        const { store } = newStore();          // kennt nur 'anna'
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Alt', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.addCard('b', { title: 'Auch alt', columnId: 'todo', assignees: ['bjoern', 'anna'] }, 'test');
        store.addCard('b', { title: 'Sauber', columnId: 'todo', assignees: ['anna'] }, 'test');

        const verwaist = store.findOrphanedAssignees();

        assert.equal(verwaist.length, 1);
        assert.equal(verwaist[0].name, 'bjoern');
        assert.equal(verwaist[0].cards, 2);
        assert.deepEqual(verwaist[0].boards, ['b']);
    });

    it('lässt Karten im Papierkorb außen vor', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const weg = store.addCard('b', { title: 'Weg', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.deleteCard('b', weg.id, 'test');

        assert.deepEqual(store.findOrphanedAssignees(), []);
    });

    it('hängt Zuständigkeiten und Mitgliedschaft um', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const board = store.getBoard('b');
        board.members = ['bjoern'];
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        const res = store.reassignUser('bjoern', 'anna', 'test');

        assert.equal(res.cards, 1);
        assert.deepEqual(store.getBoard('b').cards.find(x => x.id === c.id).assignees, ['anna']);
        assert.deepEqual(store.getBoard('b').members, ['anna']);
        assert.deepEqual(store.findOrphanedAssignees(), []);
    });

    it('erzeugt keinen doppelten Eintrag, wenn beide schon zuständig waren', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern', 'anna'] }, 'test');

        store.reassignUser('bjoern', 'anna', 'test');

        assert.deepEqual(store.getBoard('b').cards.find(x => x.id === c.id).assignees, ['anna']);
    });

    it('weist ein unbekanntes Ziel ab, statt ins Leere umzuhängen', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        assert.throws(() => store.reassignUser('bjoern', 'gibtsnicht', 'test'), /existiert nicht/);
        assert.throws(() => store.reassignUser('bjoern', 'bjoern', 'test'), /identisch/);
        assert.throws(() => store.reassignUser('', 'anna', 'test'), /Pflichtfeld/);
    });
});
