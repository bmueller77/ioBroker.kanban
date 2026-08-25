const assert = require('node:assert/strict');
const { Store, TRASH_RETENTION_DAYS } = require('../lib/store');

/**
 * Papierkorb-Systemspalte: Sie darf sich weder über die API aushebeln lassen
 * noch Karten ohne lesbaren Zeitstempel endgültig entfernen.
 */

const DAY = 86400000;
const warnings = [];

function newStore() {
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users: [{ name: 'anna' }] },
        log: { warn: m => warnings.push(m), info() {}, error() {}, debug() {} },
        // ioBroker-Objektschicht: für diesen Test ohne Belang
        setObjectNotExistsAsync: async () => {},
        setStateAsync: async () => {},
        getStateAsync: async () => null,
        delObjectAsync: async () => {},
    };
    const store = new Store(adapter, { emitEvent() {} });
    // Persistenz und Spiegel-States gehören nicht zu diesem Test
    store._schedulePersist = () => {};
    store.updateMirrors = async () => {};
    return store;
}

async function boardWithCard() {
    const store = newStore();
    const board = await store.createBoard({ id: 'b', title: 'B' });
    const card = store.addCard('b', { title: 'Karte', columnId: 'todo', assignees: ['anna'] }, 'test');
    return { store, board: store.getBoard('b'), card };
}

describe('Papierkorb: Systemspalte lässt sich nicht aushebeln', () => {
    beforeEach(() => { warnings.length = 0; });

    it('vergibt die ID der Papierkorb-Spalte nicht an eine normale Spalte', async () => {
        // Regression: Eine mitgeschickte Spalte {"id":"trash"} erzeugte eine zweite
        // Spalte gleicher ID. Wiederherstellen lief danach ins Leere, während der
        // Aufräumlauf die Karten nach der Frist endgültig entfernte.
        const { store } = await boardWithCard();
        store.updateBoard('b', {
            columns: [
                { id: 'todo', title: 'Zu erledigen' },
                { id: 'trash', title: 'Sondermüll' },
            ],
        });
        const b = store.getBoard('b');
        const trashCols = b.columns.filter(c => c.isTrash);
        assert.equal(trashCols.length, 1);
        const ids = b.columns.map(c => c.id);
        assert.equal(new Set(ids).size, ids.length, `IDs nicht eindeutig: ${ids.join(', ')}`);
        // Die untergeschobene Spalte existiert, hat aber eine eigene ID bekommen
        const fake = b.columns.find(c => c.title === 'Sondermüll');
        assert.ok(fake);
        assert.notEqual(fake.id, trashCols[0].id);
    });

    it('vergibt auch sonst keine doppelten Spalten-IDs', async () => {
        const { store } = await boardWithCard();
        store.updateBoard('b', {
            columns: [
                { id: 'gleich', title: 'Eins' },
                { id: 'gleich', title: 'Zwei' },
                { title: 'Ohne ID' },
            ],
        });
        const ids = store.getBoard('b').columns.map(c => c.id);
        assert.equal(new Set(ids).size, ids.length, `IDs nicht eindeutig: ${ids.join(', ')}`);
    });

    it('erkennt den Papierkorb weiter korrekt, wenn eine zweite Spalte seine ID trug', async () => {
        const { store } = await boardWithCard();
        const b = store.getBoard('b');
        const trashId = b.columns.find(c => c.isTrash).id;
        // Altbestand nachstellen, wie ihn die frühere Fassung erzeugen konnte
        b.columns.unshift({ id: trashId, title: 'Untergeschoben' });
        store._ensureTrashColumn(b);

        const ids = b.columns.map(c => c.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(store._isTrashColumn(b, trashId), true);
        assert.match(warnings.join(' '), /trash column id/);
    });

    it('holt eine gelöschte Karte wieder zurück', async () => {
        const { store, card } = await boardWithCard();
        store.deleteCard('b', card.id, 'test');
        const b = store.getBoard('b');
        assert.equal(store._isTrashColumn(b, b.cards[0].columnId), true);
        store.restoreCard('b', card.id, undefined, 'test');
        assert.equal(store._isTrashColumn(b, b.cards[0].columnId), false);
    });
});

describe('Papierkorb: endgültiges Löschen', () => {
    it('entfernt nur Karten, die wirklich im Papierkorb liegen', async () => {
        // Regression: purgeCard prüfte die Spalte nicht und entfernte jede aktive
        // Karte sofort unwiderruflich, an der 30-Tage-Frist vorbei.
        const { store, card } = await boardWithCard();
        assert.throws(() => store.purgeCard('b', card.id, 'test'), /nicht im Papierkorb/);
        assert.equal(store.getBoard('b').cards.length, 1);

        store.deleteCard('b', card.id, 'test');
        store.purgeCard('b', card.id, 'test');
        assert.equal(store.getBoard('b').cards.length, 0);
    });

    it('löscht abgelaufene Papierkorb-Karten im Aufräumlauf', async () => {
        const { store, card } = await boardWithCard();
        store.deleteCard('b', card.id, 'test');
        const b = store.getBoard('b');
        b.cards[0].trashedAt = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * DAY).toISOString();
        store.runCleanup(Date.now());
        assert.equal(store.getBoard('b').cards.length, 0);
    });

    it('lässt Karten mit unlesbarem Zeitstempel liegen, statt sie zu löschen', async () => {
        // Regression: `Date.parse(...) || 0` machte aus einem unlesbaren Wert die
        // Epoche — die Karte galt damit als uralt und war beim nächsten Lauf weg.
        const { store, card } = await boardWithCard();
        store.deleteCard('b', card.id, 'test');
        const b = store.getBoard('b');
        b.cards[0].trashedAt = 'völliger unsinn';
        store.runCleanup(Date.now());
        assert.equal(store.getBoard('b').cards.length, 1, 'Karte wurde fälschlich endgültig gelöscht');
    });

    it('lässt frisch gelöschte Karten liegen', async () => {
        const { store, card } = await boardWithCard();
        store.deleteCard('b', card.id, 'test');
        store.runCleanup(Date.now());
        assert.equal(store.getBoard('b').cards.length, 1);
    });
});
