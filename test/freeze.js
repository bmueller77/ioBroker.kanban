const assert = require('node:assert/strict');
const { freezePlan } = require('../lib/freeze');

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
