const assert = require('node:assert/strict');
const { Notifier } = require('../lib/notify');

/**
 * Hinweise, wenn der E-Mail-Versand nicht funktionieren kann.
 *
 * "sendTo" ist ohne Rueckruf ein Schuss ins Dunkle: Fehlt die Instanz oder ist
 * sie gestoppt, verschwindet die Nachricht lautlos. Genau das ist im August
 * passiert - Erinnerungen kamen nicht an, und im Protokoll stand nichts.
 */

/**
 * Adapter-Stub, der jede Protokollzeile mitschreibt.
 *
 * @param objekt Antwort fuer getForeignObjectAsync, null = Instanz fehlt
 * @param alive Antwort fuer getForeignStateAsync auf ".alive"
 * @returns Stub mit gesammelten Protokollzeilen unter "zeilen"
 */
function stub(objekt, alive) {
    const zeilen = { warn: [], error: [], info: [], debug: [] };
    return {
        zeilen,
        config: { emailInstance: 'email.0' },
        log: {
            warn: m => zeilen.warn.push(m),
            error: m => zeilen.error.push(m),
            info: m => zeilen.info.push(m),
            debug: m => zeilen.debug.push(m),
        },
        getForeignObjectAsync: async () => objekt,
        getForeignStateAsync: async () => alive,
        sendTo: () => {},
    };
}

/**
 * Notifier auf einem Stub.
 *
 * @param adapter Adapter-Stub
 * @returns Notifier
 */
function notifier(adapter) {
    return new Notifier(
        adapter,
        () => 'http://localhost:8095',
        () => 'Europe/Berlin',
    );
}

describe('E-Mail: Hinweis, wenn der Versand nicht gehen kann', () => {
    it('meldet eine Instanz, die es nicht gibt', async () => {
        const a = stub(null, null);
        await notifier(a)._warnIfMailerDown('email.0');
        assert.equal(a.zeilen.warn.length, 1);
        assert.match(a.zeilen.warn[0], /email\.0/);
        assert.match(a.zeilen.warn[0], /does not exist/);
        // Der Hinweis nennt auch den Weg heraus, sonst weiss niemand, wo er
        // nachsehen soll.
        assert.match(a.zeilen.warn[0], /Notifications/);
    });

    it('meldet eine Instanz, die gestoppt ist', async () => {
        const a = stub({ common: { name: 'email' } }, { val: false });
        await notifier(a)._warnIfMailerDown('email.0');
        assert.equal(a.zeilen.warn.length, 1);
        assert.match(a.zeilen.warn[0], /not running/);
        // Und sagt, dass die Nachricht nicht sofort verloren ist.
        assert.match(a.zeilen.warn[0], /delivered once the instance starts/);
    });

    it('schweigt, wenn die Instanz da ist und laeuft', async () => {
        const a = stub({ common: { name: 'email' } }, { val: true });
        await notifier(a)._warnIfMailerDown('email.0');
        assert.deepEqual(a.zeilen.warn, []);
    });

    it('warnt nicht bei jeder Karte erneut', async () => {
        const a = stub(null, null);
        const n = notifier(a);
        await n._warnIfMailerDown('email.0');
        await n._warnIfMailerDown('email.0');
        await n._warnIfMailerDown('email.0');
        assert.equal(a.zeilen.warn.length, 1, 'ein kaputter Aufbau soll das Protokoll nicht fluten');
    });

    it('meldet einen Fehler, den der E-Mail-Adapter zurueckgibt', () => {
        const a = stub({ common: {} }, { val: true });
        a.sendTo = (instanz, cmd, msg, cb) => cb({ error: 'invalid recipient' });
        notifier(a)._sendMail('email.0', { to: 'anna@example.org' }, 'anna@example.org');
        assert.equal(a.zeilen.error.length, 1);
        assert.match(a.zeilen.error[0], /invalid recipient/);
        assert.match(a.zeilen.error[0], /anna@example\.org/);
    });

    it('schweigt bei einer Antwort ohne Fehler', () => {
        const a = stub({ common: {} }, { val: true });
        a.sendTo = (instanz, cmd, msg, cb) => cb('Email sent');
        notifier(a)._sendMail('email.0', { to: 'anna@example.org' }, 'anna@example.org');
        assert.deepEqual(a.zeilen.error, []);
    });
});
