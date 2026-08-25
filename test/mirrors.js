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
    const dateien = {};
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users: [{ name: 'anna' }, { name: 'bjoern' }] },
        log: { warn() {}, info() {}, error() {}, debug() {} },
        setObjectNotExistsAsync: async () => {},
        setStateAsync: async (id, val) => { states[id] = val; },
        setStateChangedAsync: async (id, val) => { states[id] = val; },
        getStateAsync: async () => null,
        delObjectAsync: async () => {},
        // Dateispeicher fuer die Avatare, damit der Umzug pruefbar ist
        fileExistsAsync: async (_ns, name) => Object.hasOwn(dateien, name),
        readFileAsync: async (_ns, name) => ({ file: dateien[name], mimeType: 'image/png' }),
        writeFileAsync: async (_ns, name, data) => { dateien[name] = data; },
        delFileAsync: async (_ns, name) => { delete dateien[name]; },
    };
    const store = new Store(adapter, { emitEvent() {} });
    store._schedulePersist = () => {};
    // Benutzer entfernen: erzeugt genau den Zustand, den eine geloeschte oder
    // umbenannte ID hinterlaesst - die Karten zeigen weiter auf sie.
    const entferne = name => {
        adapter.config.users = adapter.config.users.filter(u => u.name !== name);
    };
    return { store, states, dateien, entferne };
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
        store.addCard('b', { title: 'Gestern faellig', columnId: 'todo', assignees: ['anna'], due: tag(-1) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 1);
        assert.equal(states['boards.b.cardCount'], 1);
    });

    it('laesst erledigte Karten und den Papierkorb aussen vor', async () => {
        const { store, states } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const done = store.addCard('b', { title: 'Erledigt', columnId: 'todo', assignees: ['anna'], due: tag(-1) }, 'test');
        store.moveCard('b', done.id, 'done', 0, 'test');
        const weg = store.addCard('b', { title: 'Papierkorb', columnId: 'todo', assignees: ['anna'], due: tag(-1) }, 'test');
        store.deleteCard('b', weg.id, 'test');
        store.addCard('b', { title: 'Offen', columnId: 'todo', assignees: ['anna'], due: tag(-1) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 1);
    });

    it('zaehlt heute faellige Karten nicht als ueberfaellig', async () => {
        const { store, states } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Heute', columnId: 'todo', assignees: ['anna'], due: tag(0) }, 'test');

        await store.updateMirrors();

        assert.equal(states['boards.b.overdueCount'], 0);
    });
});

describe('Verwaiste Zuständige', () => {
    it('findet Zuständige, die es als Benutzer nicht mehr gibt', async () => {
        // Regression: Wird eine Benutzer-ID umbenannt, zeigen die Karten ins
        // Leere - sie speichern die ID, nicht den Anzeigenamen.
        const { store, entferne } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Alt', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.addCard('b', { title: 'Auch alt', columnId: 'todo', assignees: ['bjoern', 'anna'] }, 'test');
        store.addCard('b', { title: 'Sauber', columnId: 'todo', assignees: ['anna'] }, 'test');
        entferne('bjoern');

        const verwaist = store.findOrphanedAssignees();

        assert.equal(verwaist.length, 1);
        assert.equal(verwaist[0].name, 'bjoern');
        assert.equal(verwaist[0].cards, 2);
        assert.deepEqual(verwaist[0].boards, ['b']);
    });

    it('lässt Karten im Papierkorb außen vor', async () => {
        const { store, entferne } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const weg = store.addCard('b', { title: 'Weg', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.deleteCard('b', weg.id, 'test');
        entferne('bjoern');

        assert.deepEqual(store.findOrphanedAssignees(), []);
    });

    it('hängt Zuständigkeiten und Mitgliedschaft um', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const board = store.getBoard('b');
        board.members = ['bjoern'];
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        const res = await store.reassignUser('bjoern', 'anna', 'test');

        assert.equal(res.cards, 1);
        assert.deepEqual(store.getBoard('b').cards.find(x => x.id === c.id).assignees, ['anna']);
        assert.deepEqual(store.getBoard('b').members, ['anna']);
        assert.deepEqual(store.findOrphanedAssignees(), []);
    });

    it('macht die Zielperson zum Mitglied, wenn die alte ID keines war', async () => {
        // Kommt vor, wenn eine Karte ueber die API mit einer fremden ID angelegt
        // wurde: Sonst waere die Zielperson zustaendig, taeuchte aber im
        // Personenfilter des Boards nicht auf.
        const { store, entferne } = newStore();
        store.adapter.config.users.push({ name: 'carla' });
        await store.createBoard({ id: 'b', title: 'B' });
        store.getBoard('b').members = ['anna'];
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        entferne('bjoern');

        await store.reassignUser('bjoern', 'carla', 'test');

        assert.deepEqual(store.getBoard('b').members, ['anna', 'carla']);
    });

    it('laesst eine leere Mitgliederliste leer - sie bedeutet "alle"', async () => {
        const { store, entferne } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.getBoard('b').members = [];
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        entferne('bjoern');

        await store.reassignUser('bjoern', 'anna', 'test');

        assert.deepEqual(store.getBoard('b').members, []);
    });

    it('erzeugt keinen doppelten Eintrag, wenn beide schon zuständig waren', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern', 'anna'] }, 'test');

        await store.reassignUser('bjoern', 'anna', 'test');

        assert.deepEqual(store.getBoard('b').cards.find(x => x.id === c.id).assignees, ['anna']);
    });

    it('weist ein unbekanntes Ziel ab, statt ins Leere umzuhängen', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        await assert.rejects(() => store.reassignUser('bjoern', 'gibtsnicht', 'test'), /existiert nicht/);
        await assert.rejects(() => store.reassignUser('bjoern', 'bjoern', 'test'), /identisch/);
        await assert.rejects(() => store.reassignUser('', 'anna', 'test'), /Pflichtfeld/);
    });

    it('laesst Karten im Papierkorb unangetastet', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const bleibt = store.addCard('b', { title: 'Weg', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.deleteCard('b', bleibt.id, 'test');
        const zieht = store.addCard('b', { title: 'Bleibt', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        const res = await store.reassignUser('bjoern', 'anna', 'test');

        assert.equal(res.cards, 1);
        const karten = store.getBoard('b').cards;
        assert.deepEqual(karten.find(x => x.id === zieht.id).assignees, ['anna']);
        assert.deepEqual(karten.find(x => x.id === bleibt.id).assignees, ['bjoern']);
    });

    it('nimmt das Avatarbild mit', async () => {
        const { store, dateien } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        dateien['avatars/bjoern.png'] = 'BILD';

        const res = await store.reassignUser('bjoern', 'anna', 'test');

        assert.equal(res.avatar, true);
        assert.equal(dateien['avatars/anna.png'], 'BILD');
        assert.equal(Object.hasOwn(dateien, 'avatars/bjoern.png'), false);
    });

    it('ueberschreibt ein vorhandenes Bild der Zielperson nicht', async () => {
        const { store, dateien } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        dateien['avatars/bjoern.png'] = 'ALT';
        dateien['avatars/anna.png'] = 'SCHON DA';

        const res = await store.reassignUser('bjoern', 'anna', 'test');

        assert.equal(res.avatar, false);
        assert.equal(dateien['avatars/anna.png'], 'SCHON DA');
    });
});

describe('Verwaiste Zustaendige: Kartenliste', () => {
    it('nennt Board und Spalte zu jeder Karte', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'Board B' });
        store.addCard('b', { title: 'Zwei', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.addCard('b', { title: 'Eins', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        const res = store.orphanedCards('bjoern');

        assert.equal(res.total, 2);
        assert.deepEqual(res.cards.map(c => c.title), ['Eins', 'Zwei']);
        assert.equal(res.cards[0].boardTitle, 'Board B');
        assert.ok(res.cards[0].columnTitle);
    });

    it('laesst den Papierkorb aus', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const weg = store.addCard('b', { title: 'Weg', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        store.deleteCard('b', weg.id, 'test');
        store.addCard('b', { title: 'Da', columnId: 'todo', assignees: ['bjoern'] }, 'test');

        const res = store.orphanedCards('bjoern');

        assert.equal(res.total, 1);
        assert.equal(res.cards[0].title, 'Da');
    });

    it('kuerzt auf das Limit, nennt aber die volle Zahl', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        for (const t of ['A', 'B', 'C']) {
            store.addCard('b', { title: t, columnId: 'todo', assignees: ['bjoern'] }, 'test');
        }

        const res = store.orphanedCards('bjoern', 2);

        assert.equal(res.total, 3);
        assert.equal(res.cards.length, 2);
    });

    it('gibt fuer eine leere Anfrage nichts zurueck', async () => {
        const { store } = newStore();
        assert.deepEqual(store.orphanedCards(''), { name: '', total: 0, cards: [] });
    });
});

describe('API-Pruefung: Zustaendige und Labels', () => {
    it('weist eine Karte ohne Zustaendigen ab', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });

        assert.throws(() => store.addCard('b', { title: 'Ohne', columnId: 'todo' }, 'test'), /assignees fehlt/);
        assert.throws(
            () => store.addCard('b', { title: 'Leer', columnId: 'todo', assignees: [] }, 'test'),
            /assignees fehlt/,
        );
    });

    it('weist eine unbekannte Person ab und nennt die moeglichen', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });

        assert.throws(
            () => store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['default'] }, 'test'),
            /unbekannte zustaendige Person: default.*anna/s,
        );
    });

    it('laesst eine verwaiste Karte weiter bearbeiten', async () => {
        // Sonst waere ausgerechnet die Karte gesperrt, die man retten will.
        const { store, entferne } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['bjoern'] }, 'test');
        entferne('bjoern');

        store.updateCard('b', c.id, { title: 'Neuer Titel', assignees: ['bjoern'] }, 'test');

        assert.equal(store.getBoard('b').cards[0].title, 'Neuer Titel');
    });

    it('nimmt eine unbekannte Person beim Bearbeiten trotzdem nicht neu auf', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const c = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['anna'] }, 'test');

        assert.throws(() => store.updateCard('b', c.id, { assignees: ['gustav'] }, 'test'), /unbekannte/);
    });

    it('legt ein unbekanntes Label am Board an, statt es abzulehnen', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });

        const c = store.addCard(
            'b',
            { title: 'Karte', columnId: 'todo', assignees: ['anna'], labels: ['garten', 'garten'] },
            'test',
        );

        assert.deepEqual(c.labels, ['garten']);
        const label = store.getBoard('b').labels.find(l => l.id === 'garten');
        assert.ok(label, 'Label wurde nicht am Board angelegt');
        assert.equal(label.title, 'garten');
    });

    it('legt ein vorhandenes Label nicht doppelt an', async () => {
        const { store } = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard('b', { title: 'Eins', columnId: 'todo', assignees: ['anna'], labels: ['garten'] }, 'test');
        store.addCard('b', { title: 'Zwei', columnId: 'todo', assignees: ['anna'], labels: ['garten'] }, 'test');

        assert.equal(store.getBoard('b').labels.filter(l => l.id === 'garten').length, 1);
    });
});
