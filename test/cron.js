const assert = require('node:assert/strict');
const { parseCron, cronMatchesDate, validateCron } = require('../lib/cron');
const { nextCronDates, recMatches } = require('../lib/store');

/** Datum als lokale Mittagszeit — so rechnet auch der Store, damit keine
 *  Zeitzonenverschiebung den Tag kippt. */
const day = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
};
const hits = (expr, iso) => cronMatchesDate(parseCron(expr), day(iso));

describe('Cron: Ausdruck zerlegen', () => {
    it('nimmt fünf Felder und leitet die Uhrzeit ab', () => {
        assert.equal(parseCron('30 7 * * *').time, '07:30');
        assert.equal(parseCron('0 0 * * *').time, '00:00');
    });

    it('nimmt die früheste Zeit, wenn das Muster mehrere nennt', () => {
        assert.equal(parseCron('15,45 8-10 * * *').time, '08:15');
    });

    it('weist Ausdrücke mit falscher Feldzahl ab', () => {
        assert.equal(validateCron('0 8 * *').ok, false);
        assert.equal(validateCron('').ok, false);
        assert.equal(validateCron('0 8 * * * *').ok, false);
    });

    it('weist Werte außerhalb des Bereichs ab', () => {
        assert.equal(validateCron('99 8 * * *').ok, false);
        assert.equal(validateCron('0 25 * * *').ok, false);
        assert.equal(validateCron('0 8 32 * *').ok, false);
        assert.equal(validateCron('0 8 * 13 *').ok, false);
        assert.equal(validateCron('0 8 * * 8').ok, false);
    });

    it('weist kaputte Schrittweiten und Bereiche ab', () => {
        assert.equal(validateCron('0 8 * * 1-5/0').ok, false);
        assert.equal(validateCron('0 8 * * 5-1').ok, false);
        assert.equal(validateCron('0 8 * * abc').ok, false);
    });
});

describe('Cron: Datum trifft Muster', () => {
    it('Wochentagsbereich', () => {
        assert.equal(hits('0 8 * * 1-5', '2026-08-03'), true);
        assert.equal(hits('0 8 * * 1-5', '2026-08-08'), false);
    });

    it('fester Tag im Monat', () => {
        assert.equal(hits('30 6 1 * *', '2026-09-01'), true);
        assert.equal(hits('30 6 1 * *', '2026-09-02'), false);
    });

    it('Liste und Schrittweite', () => {
        assert.equal(hits('0 9 1,15 * *', '2026-08-15'), true);
        assert.equal(hits('0 9 */2 * *', '2026-08-03'), true);
        assert.equal(hits('0 9 */2 * *', '2026-08-04'), false);
    });

    it('Sonntag als 0 und als 7', () => {
        assert.equal(hits('0 0 * * 0', '2026-08-09'), true);
        assert.equal(hits('0 0 * * 7', '2026-08-09'), true);
    });

    it('englische Kurznamen', () => {
        assert.equal(hits('0 0 * mar *', '2027-03-05'), true);
        assert.equal(hits('0 0 * * mon', '2026-08-03'), true);
    });

    it('Tag und Wochentag zusammen gelten als ODER', () => {
        assert.equal(hits('0 0 1 * mon', '2026-08-03'), true, 'Montag');
        assert.equal(hits('0 0 1 * mon', '2026-09-01'), true, 'Monatserster');
        assert.equal(hits('0 0 1 * mon', '2026-08-05'), false, 'weder noch');
    });
});

describe('Cron: Anbindung an die Wiederholung', () => {
    it('recMatches kennt den Typ cron', () => {
        assert.equal(recMatches({ type: 'cron', cron: '0 8 * * 1-5' }, day('2026-08-03')), true);
        assert.equal(recMatches({ type: 'cron', cron: '0 8 * * 1-5' }, day('2026-08-09')), false);
    });

    it('ein kaputtes Muster trifft nie, statt zu werfen', () => {
        assert.equal(recMatches({ type: 'cron', cron: 'völliger unsinn' }, day('2026-08-03')), false);
    });

    it('liefert aufsteigende, verschiedene Termine für die Vorschau', () => {
        const next = nextCronDates('0 9 1,15 * *', 3);
        assert.equal(next.length, 3);
        assert.deepEqual(next, [...next].sort());
        assert.equal(new Set(next).size, 3);
    });

    it('liefert nichts für ein unerfüllbares Muster', () => {
        assert.deepEqual(nextCronDates('0 0 30 2 *', 3), []);
    });
});
