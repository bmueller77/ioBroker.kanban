const assert = require('node:assert/strict');
const { freezePlan, prunePlan } = require('../lib/freeze');

/**
 * Befund 22 aus dem Abnahmetest: Die Bremse gegen Neustartschleifen gab schon
 * nach einem einzigen verlorenen Merkmal endgueltig auf. Damit blieben die
 * Benutzer-IDs dauerhaft editierbar, also genau der Zustand, gegen den das
 * Einfrieren gebaut ist.
 */
describe('Einfrieren der Benutzer-IDs: was zu tun ist', () => {
    const MAX = 3;
    const offen = [{ name: 'anna' }, { name: 'bjoern' }];
    const fest = [
        { name: 'anna', fixed: true },
        { name: 'bjoern', fixed: true },
    ];

    it('schreibt beim ersten Start', () => {
        const p = freezePlan(offen, 0, MAX);
        assert.equal(p.tun, 'schreiben');
        assert.deepEqual(p.offen, ['anna', 'bjoern']);
    });

    it('schreibt nach einem verlorenen Merkmal erneut', () => {
        // Das ist der Fall, der frueher scheiterte: Der Benutzer hat die
        // Instanzeinstellungen gespeichert, waehrend der Adapter schrieb.
        assert.equal(freezePlan(offen, 1, MAX).tun, 'schreiben');
        assert.equal(freezePlan(offen, 2, MAX).tun, 'schreiben');
    });

    it('gibt erst nach der Hoechstzahl auf', () => {
        assert.equal(freezePlan(offen, 3, MAX).tun, 'aufgeben');
        assert.equal(freezePlan(offen, 9, MAX).tun, 'aufgeben');
    });

    it('tut nichts, wenn alles festgeschrieben ist', () => {
        assert.equal(freezePlan(fest, 0, MAX).tun, 'nichts');
        assert.deepEqual(freezePlan(fest, 0, MAX).offen, []);
    });

    it('setzt den Zaehler nach einem sauberen Start zurueck', () => {
        // Sonst waere das Kontingent nach drei Verlusten fuer immer aufgebraucht,
        // auch wenn das Merkmal Jahre spaeter erneut verlorengeht.
        assert.equal(freezePlan(fest, 2, MAX).zuruecksetzen, true);
        assert.equal(freezePlan(fest, 0, MAX).zuruecksetzen, false);
        assert.equal(freezePlan(offen, 2, MAX).zuruecksetzen, false);
    });

    it('nimmt nur die Benutzer, denen das Merkmal fehlt', () => {
        const gemischt = [{ name: 'anna', fixed: true }, { name: 'bjoern' }];
        const p = freezePlan(gemischt, 0, MAX);
        assert.equal(p.tun, 'schreiben');
        assert.deepEqual(p.offen, ['bjoern']);
    });

    it('tut ohne Benutzer nichts', () => {
        // Genau der Zustand von kanban.4 im Abnahmetest: Dort waren alle
        // Benutzer geloescht, das fehlende Merkmal war also kein Fehler.
        assert.equal(freezePlan([], 0, MAX).tun, 'nichts');
        assert.equal(freezePlan(undefined, 0, MAX).tun, 'nichts');
        assert.equal(freezePlan([{ name: '' }, null], 0, MAX).tun, 'nichts');
    });
});

describe('Festgeschriebene Kennungen aufraeumen', () => {
    // B16: Die Liste wuchs nur. Nach dem Loeschen eines Benutzers blieb seine
    // Kennung darin stehen, und ein spaeter angelegter Benutzer mit derselben
    // Kennung waere von Anfang an gesperrt gewesen.
    it('traegt aus, was es als Benutzer nicht mehr gibt', () => {
        const { bleibt, faellt } = prunePlan(['anna', 'ben', 'tom'], [{ name: 'anna' }, { name: 'tom' }]);
        assert.deepEqual(bleibt, ['anna', 'tom']);
        assert.deepEqual(faellt, ['ben']);
    });

    it('laesst alles stehen, solange jeder noch da ist', () => {
        const { bleibt, faellt } = prunePlan(['anna', 'ben'], [{ name: 'ben' }, { name: 'anna' }]);
        assert.deepEqual(bleibt, ['anna', 'ben']);
        assert.deepEqual(faellt, []);
    });

    it('behaelt die Reihenfolge der bisherigen Liste', () => {
        const { bleibt } = prunePlan(['tom', 'anna', 'ben'], [{ name: 'anna' }, { name: 'ben' }, { name: 'tom' }]);
        assert.deepEqual(bleibt, ['tom', 'anna', 'ben']);
    });

    it('kommt mit leeren und unbrauchbaren Eingaben zurecht', () => {
        assert.deepEqual(prunePlan([], [{ name: 'anna' }]), { bleibt: [], faellt: [] });
        assert.deepEqual(prunePlan(null, null), { bleibt: [], faellt: [] });
        assert.deepEqual(prunePlan(['anna', '', null, 7], []), { bleibt: [], faellt: ['anna'] });
    });

    it('raeumt alles ab, wenn der letzte Benutzer geht', () => {
        // Genau der Zustand, in dem der Tester kanban.4 hinterlassen hat.
        const { bleibt, faellt } = prunePlan(['user1', 'user2'], []);
        assert.deepEqual(bleibt, []);
        assert.deepEqual(faellt, ['user1', 'user2']);
    });
});

describe('Einfrieren nur, woran etwas haengt', () => {
    // A15: Der Rueckschreibvorgang kostet einen Neustart, und in dessen Fenster
    // ging das Speichern im Admin verloren. Er faellt jetzt weg, solange keine
    // Karte und kein Avatar auf die Kennung zeigt.
    const users = [{ name: 'anna' }, { name: 'ben' }];

    it('laesst unbenutzte Kennungen in Ruhe', () => {
        const plan = freezePlan(users, 0, 3, new Set());
        assert.equal(plan.tun, 'nichts');
        assert.deepEqual(plan.offen, []);
    });

    it('schreibt nur die Kennung fest, an der etwas haengt', () => {
        const plan = freezePlan(users, 0, 3, new Set(['ben']));
        assert.equal(plan.tun, 'schreiben');
        assert.deepEqual(plan.offen, ['ben']);
    });

    it('laesst bereits festgeschriebene aus', () => {
        const plan = freezePlan([{ name: 'anna', fixed: true }, { name: 'ben' }], 0, 3, new Set(['anna', 'ben']));
        assert.deepEqual(plan.offen, ['ben']);
    });

    it('haelt sich ohne Angabe wie frueher', () => {
        // Ohne die Menge gilt jede Kennung als schuetzenswert. Das ist der
        // Rueckfall, falls der Store einmal nichts liefert.
        const plan = freezePlan(users, 0, 3);
        assert.deepEqual(plan.offen, ['anna', 'ben']);
    });

    it('gibt nach drei Versuchen auch bei benutzten Kennungen auf', () => {
        const plan = freezePlan(users, 3, 3, new Set(['anna']));
        assert.equal(plan.tun, 'aufgeben');
    });
});
