const assert = require('node:assert/strict');
const { Store, userKey } = require('../lib/store');

/**
 * Benutzerkennungen im Zustandsbaum.
 *
 * Bis 0.3.7 stand der Anzeigename unveraendert im Pfad, also "users.Bjoern
 * Mueller" mit Leerzeichen und Umlaut. Bei der Pruefung zur Aufnahme ins
 * Repository beanstandet. Ab 0.3.8 wird der Name bereinigt, der Anzeigename
 * bleibt im Kanalnamen stehen, und bestehende Instanzen werden beim Start
 * geradegezogen.
 */

/**
 * Store mit einem Adapter, der Objekte und States mitschreibt.
 *
 * @param namen Anzeigenamen der konfigurierten Benutzer
 * @param vorhanden Objekte, die es auf der Instanz schon gibt (id -> Objekt)
 * @returns Store samt Sammlungen und dem Protokoll
 */
function newStore(namen, vorhanden) {
    const states = {};
    const objekte = { ...(vorhanden || {}) };
    const geloescht = [];
    const protokoll = { info: [], warn: [] };
    const adapter = {
        _language: 'de',
        namespace: 'kanban.9',
        config: { users: (namen || []).map(n => ({ name: n })) },
        log: {
            info: m => protokoll.info.push(m),
            warn: m => protokoll.warn.push(m),
            error() {},
            debug() {},
        },
        setObjectNotExistsAsync: async (id, obj) => {
            if (!Object.hasOwn(objekte, `kanban.9.${id}`)) {
                objekte[`kanban.9.${id}`] = obj;
            }
        },
        setStateAsync: async (id, val) => { states[id] = val; },
        setStateChangedAsync: async (id, val) => { states[id] = val; },
        getStateAsync: async () => null,
        getAdapterObjectsAsync: async () => objekte,
        delObjectAsync: async id => {
            geloescht.push(id);
            for (const k of Object.keys(objekte)) {
                if (k === `kanban.9.${id}` || k.startsWith(`kanban.9.${id}.`)) {
                    delete objekte[k];
                }
            }
        },
        fileExistsAsync: async () => false,
        readFileAsync: async () => ({ file: null, mimeType: '' }),
        writeFileAsync: async () => {},
        delFileAsync: async () => {},
    };
    const store = new Store(adapter, { emitEvent() {} });
    store._schedulePersist = () => {};
    return { store, adapter, states, objekte, geloescht, protokoll };
}

/** Kanal eines Benutzers, wie er auf einer Instanz vor 0.3.8 aussah. */
function alterKanal(name) {
    return {
        [`kanban.9.users.${name}`]: { type: 'channel', common: { name } },
        [`kanban.9.users.${name}.assignedCount`]: { type: 'state', common: { name: 'Assigned open cards' } },
        [`kanban.9.users.${name}.overdueCount`]: { type: 'state', common: { name: 'Overdue cards' } },
    };
}

describe('Benutzerkennungen: userKey()', () => {
    it('schreibt Umlaute aus und zieht alles andere zu Bindestrichen zusammen', () => {
        assert.equal(userKey('Björn Müller'), 'bjoern-mueller');
        assert.equal(userKey('Weiß'), 'weiss');
        assert.equal(userKey('Opa & Oma'), 'opa-oma');
        assert.equal(userKey('ÄÖÜ'), 'aeoeue');
    });

    it('laesst eine schon saubere Kennung unveraendert', () => {
        // Wichtig fuer die Migration: Wer bisher einen sauberen Namen hatte,
        // behaelt seinen Pfad, und nichts wird geloescht.
        assert.equal(userKey('anna'), 'anna');
        assert.equal(userKey('team-nord'), 'team-nord');
        assert.equal(userKey('user2'), 'user2');
    });

    it('wirft keine leere Kennung aus', () => {
        // Eine leere Id waere ein Objekt namens "users." - der Rueckfall heisst
        // "user", nicht "board" wie bei slugify().
        assert.equal(userKey('   '), 'user');
        assert.equal(userKey('!!!'), 'user');
        assert.equal(userKey(''), 'user');
        assert.equal(userKey(null), 'user');
        assert.equal(userKey(undefined), 'user');
    });

    it('verliert keine Ziffern', () => {
        assert.equal(userKey('Kind 2'), 'kind-2');
    });
});

describe('Benutzerkennungen: Pfade der Spiegel-States', () => {
    it('legt den Kanal unter der bereinigten Kennung an und behaelt den Anzeigenamen', async () => {
        const { store, objekte } = newStore(['Björn Müller']);
        await store.updateMirrors();
        assert.ok(objekte['kanban.9.users.bjoern-mueller'], 'Kanal unter der Kennung fehlt');
        assert.equal(objekte['kanban.9.users.bjoern-mueller'].common.name, 'Björn Müller');
        assert.ok(!objekte['kanban.9.users.Björn Müller'], 'alter Pfad doch angelegt');
    });

    it('schreibt die Zahlen unter die Kennung', async () => {
        const { store, states } = newStore(['Björn Müller']);
        await store.updateMirrors();
        assert.equal(states['users.bjoern-mueller.assignedCount'], 0);
        assert.equal(states['users.bjoern-mueller.overdueCount'], 0);
        assert.equal(states['users.bjoern-mueller.overdueList'], '[]');
        assert.ok(!Object.keys(states).some(k => k.includes('Björn')), 'Anzeigename noch in einem Pfad');
    });

    it('gibt zwei Namen mit derselben Kennung getrennte Kanaele', async () => {
        // "Opa & Oma" und "Opa Oma" ergeben beide "opa-oma". Ohne Zaehler
        // wuerden beide denselben Kanal beschreiben und die Zahlen des einen
        // die des anderen ueberschreiben.
        const { store } = newStore(['Opa & Oma', 'Opa Oma']);
        const a = store._userKey('Opa & Oma');
        const b = store._userKey('Opa Oma');
        assert.equal(a, 'opa-oma');
        assert.equal(b, 'opa-oma-2');
        assert.notEqual(a, b);
    });

    it('gibt beim zweiten Aufruf dieselbe Kennung zurueck', async () => {
        const { store } = newStore(['Opa & Oma', 'Opa Oma']);
        store._userKey('Opa & Oma');
        store._userKey('Opa Oma');
        assert.equal(store._userKey('Opa & Oma'), 'opa-oma');
        assert.equal(store._userKey('Opa Oma'), 'opa-oma-2');
    });
});

describe('Benutzerkennungen: Migration bestehender Instanzen', () => {
    it('entfernt den Kanal mit dem Anzeigenamen im Pfad', async () => {
        const { store, geloescht, objekte } = newStore(['Björn Müller'], alterKanal('Björn Müller'));
        const n = await store.migrateUserStates();
        assert.equal(n, 1);
        assert.deepEqual(geloescht, ['users.Björn Müller']);
        assert.ok(!objekte['kanban.9.users.Björn Müller'], 'Kanal noch da');
        assert.ok(!objekte['kanban.9.users.Björn Müller.assignedCount'], 'State darunter noch da');
    });

    it('legt die Zahlen danach unter der neuen Kennung wieder an', async () => {
        const { store, states, objekte } = newStore(['Björn Müller'], alterKanal('Björn Müller'));
        await store.migrateUserStates();
        await store.updateMirrors();
        assert.ok(objekte['kanban.9.users.bjoern-mueller'], 'neuer Kanal fehlt');
        assert.equal(states['users.bjoern-mueller.assignedCount'], 0);
    });

    it('laesst einen Kanal in Ruhe, dessen Kennung schon stimmt', async () => {
        const { store, geloescht, objekte } = newStore(['anna'], alterKanal('anna'));
        const n = await store.migrateUserStates();
        assert.equal(n, 0);
        assert.deepEqual(geloescht, []);
        assert.ok(objekte['kanban.9.users.anna'], 'sauberer Kanal entfernt');
    });

    it('raeumt auch den Kanal eines Benutzers weg, der nicht mehr konfiguriert ist', async () => {
        // Wird jemand entfernt, waehrend der Adapter steht, laeuft
        // _forgetGoneUsers nie ueber ihn - der Kanal bliebe fuer immer stehen.
        const { store, geloescht } = newStore(['anna'], { ...alterKanal('anna'), ...alterKanal('karl') });
        const n = await store.migrateUserStates();
        assert.equal(n, 1);
        assert.deepEqual(geloescht, ['users.karl']);
    });

    it('fasst Objekte ausserhalb von users. nicht an', async () => {
        const fremd = {
            'kanban.9.boards.family': { type: 'channel', common: { name: 'Family' } },
            'kanban.9.info': { type: 'channel', common: { name: 'Information' } },
            'kanban.9.lastEvent': { type: 'state', common: { name: 'Last event' } },
        };
        const { store, geloescht, objekte } = newStore(['anna'], fremd);
        await store.migrateUserStates();
        assert.deepEqual(geloescht, []);
        assert.ok(objekte['kanban.9.boards.family']);
        assert.ok(objekte['kanban.9.info']);
    });

    it('nimmt nur Kanaele, nicht die States darunter', async () => {
        // Ohne die Pruefung auf den Typ waere "users.anna.assignedCount" ein
        // eigener Kandidat und wuerde einzeln geloescht.
        const { store, geloescht } = newStore([], alterKanal('anna'));
        await store.migrateUserStates();
        assert.deepEqual(geloescht, ['users.anna']);
    });

    it('schreibt die Umbenennung ins Protokoll', async () => {
        // Wer die alte Id in einem Skript verwendet, muss erfahren, warum sie
        // verschwunden ist.
        const { store, protokoll } = newStore(['Björn Müller'], alterKanal('Björn Müller'));
        await store.migrateUserStates();
        assert.equal(protokoll.info.length, 1);
        assert.match(protokoll.info[0], /users\.Björn Müller/);
        assert.match(protokoll.info[0], /sanitized/);
    });

    it('meldet nichts und bricht nicht ab, wenn die Objekte nicht zu lesen sind', async () => {
        const { store, adapter, protokoll } = newStore(['anna']);
        adapter.getAdapterObjectsAsync = async () => { throw new Error('kein Zugriff'); };
        const n = await store.migrateUserStates();
        assert.equal(n, 0);
        assert.equal(protokoll.warn.length, 1);
        assert.match(protokoll.warn[0], /kein Zugriff/);
    });

    it('ueberlebt ein Objekt ohne common', async () => {
        const { store } = newStore(['anna'], { 'kanban.9.users.karl': { type: 'channel' } });
        const n = await store.migrateUserStates();
        assert.equal(n, 1);
    });
});
