const assert = require('node:assert/strict');
const { Store, isoDay, todayStr } = require('../lib/store');
const { buildRrule } = require('../lib/notify');

/**
 * Wiederholungen beim Erledigen.
 *
 * Fuer nextDue, firstDue und _spawnRecurrence gab es bis 0.3.2 keinen einzigen
 * Test; abgedeckt war nur der Typ cron in test/cron.js. Diese Datei holt das
 * fuer den Teil nach, an dem gerechnet wird: welches Datum die Folgekarte
 * bekommt.
 */

/** Tag relativ zu heute als JJJJ-MM-TT. */
function tag(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newStore() {
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users: [{ name: 'anna' }] },
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
 * Board mit einer wiederkehrenden Karte, die heute erledigt wird.
 *
 * @param rec Wiederholungsregel
 * @param due Faelligkeit der Karte
 * @returns Store, Board und die urspruengliche Regel als Kopie
 */
async function erledige(rec, due) {
    const store = newStore();
    await store.createBoard({ id: 'b', title: 'B' });
    const karte = store.addCard(
        'b',
        { title: 'Filter wechseln', columnId: 'todo', assignees: ['anna'], due, recurrence: rec },
        'test',
    );
    store.moveCard('b', karte.id, 'done', undefined, 'test');
    const board = store.getBoard('b');
    const folge = board.cards.find(c => c.id !== karte.id);
    return { store, board, folge, erledigt: board.cards.find(c => c.id === karte.id) };
}

describe('Wiederholung: alle X Tage, Raster gegen Erledigung', () => {
    // Der Fall aus Issue #40: Ein Filter soll alle 30 Tage gewechselt werden.
    // Faellig war Tag 30, gewechselt wird erst an Tag 40.
    const INTERVALL = 30;
    const faellig = tag(-10);
    const startRaster = tag(-40); // damit "faellig" auf dem Raster liegt

    it('rechnet mit dem Raster am Startdatum weiter', async () => {
        const { folge } = await erledige(
            { type: 'every_n_days', interval: INTERVALL, startDate: startRaster },
            faellig,
        );
        // Naechster Rasterpunkt nach der alten Faelligkeit, also 20 Tage nach
        // dem Wechsel statt 30. Genau die Beschwerde aus dem Issue.
        assert.equal(folge.due, tag(20));
    });

    it('rechnet ab dem Erledigen, wenn die neue Art gewaehlt ist', async () => {
        const { folge } = await erledige(
            { type: 'every_n_days_done', interval: INTERVALL, startDate: startRaster },
            faellig,
        );
        assert.equal(folge.due, tag(30));
    });

    it('haengt das Startdatum der Folgekarte auf den Erledigungstag um', async () => {
        const { folge } = await erledige(
            { type: 'every_n_days_done', interval: INTERVALL, startDate: startRaster },
            faellig,
        );
        assert.equal(folge.recurrence.startDate, todayStr());
        assert.equal(folge.recurrence.type, 'every_n_days_done');
        assert.equal(folge.recurrence.interval, INTERVALL);
    });

    it('laesst die uebergebene Regel unveraendert', async () => {
        // Die alte Regel steckt bereits im cardDone-Ereignis. Wer sie ohne Klon
        // weiterreicht und danach startDate umsetzt, aendert rueckwirkend, was
        // an Webhooks verschickt wird.
        const rec = { type: 'every_n_days_done', interval: INTERVALL, startDate: startRaster };
        const kopie = { ...rec };
        const { folge } = await erledige(rec, faellig);
        assert.deepEqual(rec, kopie);
        assert.notEqual(folge.recurrence.startDate, startRaster);
    });

    it('rechnet bei puenktlicher Erledigung wie die alte Art', async () => {
        const heute = todayStr();
        const alt = await erledige({ type: 'every_n_days', interval: INTERVALL, startDate: heute }, heute);
        const neu = await erledige({ type: 'every_n_days_done', interval: INTERVALL, startDate: heute }, heute);
        assert.equal(alt.folge.due, tag(INTERVALL));
        assert.equal(neu.folge.due, tag(INTERVALL));
    });

    it('kommt mit Intervall 1 zurecht', async () => {
        const { folge } = await erledige({ type: 'every_n_days_done', interval: 1, startDate: tag(-9) }, tag(-3));
        assert.equal(folge.due, tag(1));
    });

    it('kommt ohne Startdatum und ohne Faelligkeit zurecht', async () => {
        const { folge } = await erledige({ type: 'every_n_days_done', interval: 7 }, '');
        assert.equal(folge.due, tag(7));
    });

    it('nimmt die erledigte Karte aus der Wiederholung', async () => {
        const { erledigt } = await erledige(
            { type: 'every_n_days_done', interval: INTERVALL, startDate: startRaster },
            faellig,
        );
        assert.equal(erledigt.recurrence, null);
    });
});

describe('Wiederholung: zweimal hintereinander erledigen', () => {
    it('zaehlt jedes Mal ab dem neuen Erledigungstag', async () => {
        // Ein einzelner Durchlauf laesst einen geteilten Verweis noch durch.
        const store = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        const eins = store.addCard(
            'b',
            {
                title: 'Filter',
                columnId: 'todo',
                assignees: ['anna'],
                due: tag(-10),
                recurrence: { type: 'every_n_days_done', interval: 30, startDate: tag(-40) },
            },
            'test',
        );
        store.moveCard('b', eins.id, 'done', undefined, 'test');
        const zwei = store.getBoard('b').cards.find(c => c.id !== eins.id);
        assert.equal(zwei.due, tag(30));

        store.moveCard('b', zwei.id, 'done', undefined, 'test');
        const drei = store.getBoard('b').cards.find(c => c.id !== eins.id && c.id !== zwei.id);
        // Auch der zweite Lauf zaehlt ab heute, weil heute erledigt wurde.
        assert.equal(drei.due, tag(30));
        // Und die beiden Regeln sind eigene Objekte.
        assert.notStrictEqual(zwei.recurrence, drei.recurrence);
    });
});

describe('Wiederholung: die neue Art im Rest des Systems', () => {
    it('laesst sich ueber die Schnittstelle anlegen und wieder auslesen', async () => {
        const store = newStore();
        await store.createBoard({ id: 'b', title: 'B' });
        store.addCard(
            'b',
            {
                title: 'Karte',
                columnId: 'todo',
                assignees: ['anna'],
                due: tag(3),
                recurrence: { type: 'every_n_days_done', interval: 14, startDate: tag(3) },
            },
            'api',
        );
        const karte = store.getBoard('b').cards[0];
        assert.equal(karte.recurrence.type, 'every_n_days_done');
        assert.equal(karte.recurrence.interval, 14);
    });

    it('erzeugt keine Serienregel fuer den Kalender', () => {
        // Wann der naechste Termin faellt, entscheidet erst der Haken. Eine
        // feste Regel im Kalender waere eine Behauptung, die niemand einhaelt.
        assert.equal(buildRrule({ type: 'every_n_days_done', interval: 30 }), '');
        // Zum Vergleich: die alte Art hat eine feste Schrittweite.
        assert.equal(buildRrule({ type: 'every_n_days', interval: 30 }), 'RRULE:FREQ=DAILY;INTERVAL=30');
    });
});

describe('Kalendertag aus einem Zeitstempel', () => {
    it('liest den Tag in Ortszeit', () => {
        const jetzt = new Date();
        // Nicht gegen eine feste Zeichenkette pruefen, sonst faellt der Test in
        // einer anderen Zeitzone um.
        const erwartet = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
        assert.equal(isoDay(jetzt.toISOString()), erwartet);
    });

    it('gibt bei unbrauchbaren Werten nichts zurueck, statt zu raten', () => {
        // parseDateStr faellt bei allem, was nicht JJJJ-MM-TT ist, still auf die
        // aktuelle Zeit zurueck. Ein '' hier laesst den Aufrufer das merken.
        for (const v of ['', null, undefined, 'kaputt', '2026-13-45T99:99:99Z']) {
            assert.equal(isoDay(v), '');
        }
    });
});
