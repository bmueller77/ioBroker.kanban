const assert = require('node:assert/strict');
const { parseCron, cronMatchesDate, validateCron } = require('../lib/cron');
const { nextCronDates, recMatches } = require('../lib/store');
const { buildRrule } = require('../lib/notify');

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

    it('weist überlange Ausdrücke ab, statt den Event-Loop zu blockieren', () => {
        // Regression: die token-freie Prüfroute nahm kilobytegroße Ausdrücke an und
        // zerlegte sie für jeden Kandidatentag neu — 6 KB blockierten rund 300 ms.
        const riesig = `${Array.from({ length: 1200 }, (_, i) => i % 60).join(',')} 0 30 2 *`;
        assert.match(validateCron(riesig).error, /zu lang/);
        assert.equal(validateCron(riesig).ok, false);
        assert.deepEqual(nextCronDates(riesig, 3), []);
        // Das längste sinnvolle Muster bleibt zulässig.
        assert.equal(validateCron('0 8 * jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec *').ok, true);
    });
});

describe('Cron: Kalender-Serientermin (RRULE)', () => {
    it('nimmt den Sonntag mit — als 0 und als 7', () => {
        // Regression: ICS_DAYS ist mit 1..7 indiziert, v % 7 machte aus Cron-0 und
        // Cron-7 die 0 und liess den Sonntag aus der Serie fallen.
        assert.equal(buildRrule({ type: 'cron', cron: '0 9 * * 0' }), 'RRULE:FREQ=WEEKLY;BYDAY=SU');
        assert.equal(buildRrule({ type: 'cron', cron: '0 9 * * 7' }), 'RRULE:FREQ=WEEKLY;BYDAY=SU');
        assert.equal(buildRrule({ type: 'cron', cron: '0 9 * * 0,3' }), 'RRULE:FREQ=WEEKLY;BYDAY=SU,WE');
        assert.equal(buildRrule({ type: 'cron', cron: '0 9 * * 1-7' }), 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU');
    });

    it('nennt denselben Tag nicht doppelt', () => {
        assert.equal(buildRrule({ type: 'cron', cron: '0 9 * * 0,7' }), 'RRULE:FREQ=WEEKLY;BYDAY=SU');
    });

    it('lässt die übrigen Wochentage unverändert', () => {
        assert.equal(buildRrule({ type: 'cron', cron: '0 8 * * 1-5' }), 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        assert.equal(buildRrule({ type: 'cron', cron: '0 8 * * *' }), 'RRULE:FREQ=DAILY');
    });
});
