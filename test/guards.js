const assert = require('node:assert/strict');
const { Server } = require('../lib/server');

/**
 * Prüft die Token-Guards der REST-API ohne laufenden ioBroker:
 * Board-Bindung der Agenten-Tokens (ab 0.3.0 auch auf /api) und die
 * zulässigen Übergabewege für Tokens.
 */

const SPA = 'spa-secret-xyz';
const TOKENS = [
    { name: 'agent-all', token: 'tok-all', allowedBoards: '*', enabled: true },
    { name: 'agent-fam', token: 'tok-fam', allowedBoards: 'familie', enabled: true },
    { name: 'agent-two', token: 'tok-two', allowedBoards: 'familie, agenten', enabled: true },
    { name: 'agent-off', token: 'tok-off', allowedBoards: '*', enabled: false },
];

/** Führt _guardApiWrite mit einem nachgebauten Request aus und liefert den HTTP-Code. */
function call({ method = 'POST', path = '/boards/familie/cards', token, tokenIn = 'header', body = {}, config = {} }) {
    const adapter = {
        _apiSecret: SPA,
        config: { inboundTokens: TOKENS, ...config },
        log: { warn() {}, info() {}, error() {}, debug() {} },
    };
    const server = new Server(adapter, {}, async () => ({}));

    const req = {
        method, path, originalUrl: `/api${path}`, ip: '10.0.0.9',
        body: { ...body }, query: {},
        get(header) { return tokenIn === 'header' && header === 'X-Kanban-Token' ? token : undefined; },
    };
    if (tokenIn === 'body' && token) req.body._token = token;
    if (tokenIn === 'query' && token) req.query.token = token;

    let code = 0;
    const res = { status(c) { code = c; return this; }, json() { return this; } };
    server._guardApiWrite(req, res, () => { code = 200; });
    return code;
}

describe('REST-API: Schreibschutz und Board-Bindung', () => {
    it('lässt GET ohne Token durch', () => {
        assert.equal(call({ method: 'GET', token: undefined }), 200);
    });

    it('lehnt Schreibzugriffe ohne Token ab', () => {
        assert.equal(call({ token: undefined }), 401);
    });

    it('lehnt deaktivierte Tokens ab', () => {
        assert.equal(call({ token: 'tok-off' }), 401);
    });

    it('akzeptiert das SPA-Secret im Header und im Body', () => {
        assert.equal(call({ token: SPA }), 200);
        assert.equal(call({ token: SPA, tokenIn: 'body' }), 200);
    });

    it('akzeptiert keine Tokens als URL-Parameter', () => {
        assert.equal(call({ token: SPA, tokenIn: 'query' }), 401);
        assert.equal(call({ token: 'tok-all', tokenIn: 'query' }), 401);
    });

    it('lässt unbegrenzte Tokens auf jedes Board schreiben', () => {
        assert.equal(call({ token: 'tok-all', path: '/boards/agenten/cards' }), 200);
    });

    it('bindet begrenzte Tokens an ihre Boards', () => {
        assert.equal(call({ token: 'tok-fam', path: '/boards/familie/cards' }), 200);
        assert.equal(call({ token: 'tok-fam', path: '/boards/agenten/cards' }), 403);
        assert.equal(call({ token: 'tok-two', path: '/boards/agenten/cards' }), 200);
    });

    it('prüft beim Übertragen auch das Zielboard', () => {
        const base = { token: 'tok-fam', path: '/boards/familie/cards/c1/transfer' };
        assert.equal(call({ ...base, body: { toBoard: 'familie' } }), 200);
        assert.equal(call({ ...base, body: { toBoard: 'agenten' } }), 403);
        assert.equal(call({ ...base, body: { targetBoard: 'agenten' } }), 403);
    });

    it('prüft Board-Angaben aus dem Body auch ohne Board im Pfad', () => {
        assert.equal(call({ token: 'tok-fam', path: '/somewhere', body: { board: 'agenten' } }), 403);
    });

    it('verwehrt begrenzten Tokens nicht board-bezogene Schreibrouten', () => {
        assert.equal(call({ token: 'tok-fam', path: '/boards' }), 403);
        assert.equal(call({ token: 'tok-fam', method: 'PATCH', path: '/users/bjoern' }), 403);
        assert.equal(call({ token: 'tok-all', path: '/boards' }), 200);
    });

    it('respektiert apiWriteProtection = false', () => {
        assert.equal(call({ token: undefined, config: { apiWriteProtection: false } }), 200);
    });
});
