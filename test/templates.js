const assert = require('node:assert/strict');
const { Store, normalizeTemplate, TEMPLATE_LIMIT, todayStr } = require('../lib/store');

/**
 * Kartenvorlagen.
 *
 * Eine Vorlage ist ein benannter Satz Kartenfelder am Board. Geprueft wird der
 * Teil, an dem sich entscheidet, was aus ihr entsteht: welche Felder sie traegt,
 * was mit Verweisen passiert, die es nicht mehr gibt, und woran die Wiederholung
 * haengt.
 */

/**
 * Tag relativ zu heute als JJJJ-MM-TT.
 *
 * @param n Abstand in Tagen
 * @returns Datum als JJJJ-MM-TT
 */
function tag(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Store mit stillgelegtem Schreiben.
 *
 * @param users Benutzer der Instanz
 * @returns Store
 */
function newStore(users = [{ name: 'anna' }, { name: 'ben' }]) {
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users },
        log: { warn() {}, info() {}, error() {}, debug() {} },
        setObjectNotExistsAsync: async () => {},
        setStateAsync: async () => {},
        getStateAsync: async () => null,
        delObjectAsync: async () => {},
    };
    const store = new Store(adapter, { emitEvent() {} });
    store._schedulePersist = () => {};
    store.updateMirrors = async () => {};
    return store;
}

/**
 * Board mit zwei Labels, zwei Mitgliedern und einer Vorlage.
 *
 * @param tpl Vorlage, die auf dem Board liegen soll
 * @returns Store und Board
 */
async function boardMit(tpl) {
    const store = newStore();
    await store.createBoard({ id: 'b', title: 'B' });
    store.updateBoard('b', {
        members: ['anna', 'ben'],
        labels: [
            { id: 'lbl_wartung', title: 'Wartung', color: '#4CAF50' },
            { id: 'lbl_haus', title: 'Haus', color: '#1E88E5' },
        ],
        templates: [tpl],
    });
    return { store, board: store.getBoard('b') };
}

const VORLAGE = {
    name: 'Filterwechsel',
    description: 'Filter der Lüftung tauschen',
    assignees: ['anna'],
    dueTime: '09:00',
    labels: ['lbl_wartung'],
    priority: 2,
    checklist: [{ text: 'Filter bestellen', done: true }],
    location: 'Keller',
};

describe('Vorlagen: was gespeichert wird', () => {
    it('setzt die Haken der Checkliste zurueck', () => {
        const tpl = normalizeTemplate(VORLAGE);
        assert.deepEqual(
            tpl.checklist,
            [{ text: 'Filter bestellen', done: false }],
            'Eine Vorlage haelt die Punkte fest, nicht den Stand',
        );
    });

    it('traegt kein Faelligkeitsdatum', () => {
        const tpl = normalizeTemplate({ ...VORLAGE, due: '2026-01-01' });
        assert.equal(tpl.due, undefined, 'ein festes Datum wuerde altern');
    });

    it('wirft weg, was nicht in die Vorlage gehoert', () => {
        const tpl = normalizeTemplate({ ...VORLAGE, columnId: 'todo', doneAt: '2026-01-01', unfug: { a: 1 } });
        assert.equal(tpl.columnId, undefined);
        assert.equal(tpl.doneAt, undefined);
        assert.equal(tpl.unfug, undefined);
    });

    it('nimmt den Namen als Titel, wenn keiner dasteht', () => {
        assert.equal(normalizeTemplate({ name: 'Wartung' }).title, 'Wartung');
        assert.equal(normalizeTemplate({ name: 'Wartung', title: 'Filter tauschen' }).title, 'Filter tauschen');
    });

    it('besteht auf einem Namen', () => {
        assert.throws(() => normalizeTemplate({ description: 'ohne Namen' }), /without a name/);
    });

    it('vergibt eine ID, wenn keine mitkommt', () => {
        assert.match(normalizeTemplate(VORLAGE).id, /^tpl_/);
        assert.equal(normalizeTemplate({ ...VORLAGE, id: 'tpl_fest' }).id, 'tpl_fest');
    });

    it('deckelt die Zahl der Vorlagen je Board', async () => {
        const store = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const viele = Array.from({ length: TEMPLATE_LIMIT + 1 }, (_, i) => ({ name: `V${i}` }));
        assert.throws(() => store.updateBoard('b', { templates: viele }), /50/);
        assert.doesNotThrow(() => store.updateBoard('b', { templates: viele.slice(0, TEMPLATE_LIMIT) }));
    });
});

describe('Vorlagen: was daraus entsteht', () => {
    it('legt eine Karte mit den Feldern der Vorlage an', async () => {
        const { store } = await boardMit(VORLAGE);
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test');
        assert.equal(karte.title, 'Filterwechsel');
        assert.equal(karte.description, 'Filter der Lüftung tauschen');
        assert.deepEqual(karte.assignees, ['anna']);
        assert.deepEqual(karte.labels, ['lbl_wartung']);
        assert.equal(karte.priority, 2);
        assert.equal(karte.location, 'Keller');
        assert.deepEqual(karte.checklist, [{ text: 'Filter bestellen', done: false }]);
    });

    it('findet die Vorlage ueber die ID und ueber den Namen', async () => {
        const { store, board } = await boardMit(VORLAGE);
        const id = board.templates[0].id;
        assert.equal(store.addCard('b', { template: id, columnId: 'todo' }, 'test').title, 'Filterwechsel');
        assert.equal(store.addCard('b', { template: 'filterwechsel', columnId: 'todo' }, 'test').title, 'Filterwechsel');
    });

    it('laesst ausdruecklich genannte Felder stechen', async () => {
        const { store } = await boardMit(VORLAGE);
        const karte = store.addCard(
            'b',
            { template: 'Filterwechsel', columnId: 'todo', title: 'Filter im Bad', priority: 0 },
            'test',
        );
        assert.equal(karte.title, 'Filter im Bad');
        assert.equal(karte.priority, 0);
        assert.equal(karte.location, 'Keller', 'der Rest kommt weiter aus der Vorlage');
    });

    it('meldet einen unbekannten Namen, statt eine halbe Karte anzulegen', async () => {
        const { store } = await boardMit(VORLAGE);
        assert.throws(() => store.addCard('b', { template: 'Filterwexel', columnId: 'todo' }, 'test'), /Filterwexel/);
        assert.equal(store.getBoard('b').cards.length, 0);
    });

    it('veraendert die Vorlage nicht', async () => {
        const { store, board } = await boardMit(VORLAGE);
        const vorher = JSON.stringify(board.templates[0]);
        store.addCard('b', { template: 'Filterwechsel', columnId: 'todo', title: 'anders' }, 'test');
        assert.equal(JSON.stringify(store.getBoard('b').templates[0]), vorher);
    });
});

describe('Vorlagen: Verweise, die es nicht mehr gibt', () => {
    it('laesst ein geloeschtes Label weg und legt es nicht neu an', async () => {
        const { store } = await boardMit(VORLAGE);
        // Das Label verschwindet, die Vorlage zeigt weiter darauf.
        store.updateBoard('b', { labels: [{ id: 'lbl_haus', title: 'Haus', color: '#1E88E5' }] });
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test');
        assert.deepEqual(karte.labels, []);
        assert.deepEqual(
            store.getBoard('b').labels.map(l => l.id),
            ['lbl_haus'],
            '_mergeLabels haette hier ein Label namens lbl_wartung angelegt',
        );
    });

    it('laesst eine Person weg, die kein Mitglied mehr ist', async () => {
        const { store } = await boardMit({ ...VORLAGE, assignees: ['anna', 'ben'] });
        store.updateBoard('b', { members: ['ben'] });
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test');
        assert.deepEqual(karte.assignees, ['ben']);
    });

    it('meldet es, wenn niemand uebrig bleibt', async () => {
        const store = newStore([{ name: 'anna' }, { name: 'ben' }]);
        await store.createBoard({ id: 'b', title: 'B' });
        store.updateBoard('b', { members: ['ben'], templates: [{ ...VORLAGE, assignees: ['anna'] }] });
        assert.throws(() => store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test'), /assignees is missing/);
    });
});

describe('Vorlagen: die Wiederholung haengt an der neuen Karte', () => {
    const REC = { type: 'every_n_days', interval: 30, startDate: '2020-01-01' };

    it('setzt das Startdatum auf heute, wenn die Karte kein Datum hat', async () => {
        const { store } = await boardMit({ ...VORLAGE, recurrence: REC });
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test');
        assert.equal(karte.recurrence.startDate, todayStr(), 'nie das Datum aus der Vorlage');
        assert.equal(karte.due, todayStr(), 'wer eine Wartungsvorlage benutzt, ist jetzt dran');
    });

    it('setzt das Startdatum auf ein mitgegebenes Faelligkeitsdatum', async () => {
        const { store } = await boardMit({ ...VORLAGE, recurrence: REC });
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo', due: tag(7) }, 'test');
        assert.equal(karte.due, tag(7));
        assert.equal(karte.recurrence.startDate, tag(7));
    });

    it('laesst eine mitgegebene Wiederholung unangetastet', async () => {
        const { store } = await boardMit({ ...VORLAGE, recurrence: REC });
        const eigene = { type: 'every_n_days', interval: 7, startDate: '2021-06-01' };
        const karte = store.addCard(
            'b',
            { template: 'Filterwechsel', columnId: 'todo', due: tag(3), recurrence: eigene },
            'test',
        );
        assert.equal(karte.recurrence.interval, 7);
        assert.equal(karte.recurrence.startDate, '2021-06-01');
    });

    it('kommt mit den kalendergebundenen Arten ohne Startdatum aus', async () => {
        const { store } = await boardMit({ ...VORLAGE, recurrence: { type: 'workday', workdayPos: 'first' } });
        const karte = store.addCard('b', { template: 'Filterwechsel', columnId: 'todo' }, 'test');
        assert.match(karte.due, /^\d{4}-\d{2}-\d{2}$/);
    });
});
