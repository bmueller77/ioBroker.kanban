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
    // Von Hand angelegte, nicht ausgefüllte Zeilen — beide waren Löcher:
    { name: 'leer', token: '', allowedBoards: '*', enabled: true },
    { name: 'ohne-boards', token: 'tok-leer-boards', allowedBoards: '', enabled: true },
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

    it('lässt sich nicht mit einem erlaubten Board im Body aushebeln', () => {
        // Regression: createBoard liest `board` gar nicht, der Guard akzeptierte es
        // aber als Nachweis — ein begrenzter Token legte so fremde Boards an.
        assert.equal(call({ token: 'tok-fam', path: '/boards', body: { title: 'X', board: 'familie' } }), 403);
        assert.equal(call({ token: 'tok-fam', path: '/boards', body: { title: 'X', boardId: 'familie' } }), 403);
        assert.equal(call({ token: 'tok-fam', method: 'PATCH', path: '/users/bjoern', body: { color: '#fff', board: 'familie' } }), 403);
        assert.equal(call({ token: 'tok-fam', path: '/users/bjoern/avatar', body: { image: 'x', boardId: 'familie' } }), 403);
        // Das Board aus dem Pfad bleibt maßgeblich: ein erlaubtes Board im Body
        // macht ein fremdes Pfad-Board nicht zulässig.
        assert.equal(call({ token: 'tok-fam', path: '/boards/agenten/cards', body: { board: 'familie' } }), 403);
    });

    it('beantwortet eine kaputt kodierte Board-ID mit 400 statt 500', () => {
        assert.equal(call({ token: 'tok-fam', path: '/boards/%ZZ/cards' }), 400);
    });

    it('lässt sich nicht über eine leere Token-Zeile aushebeln', () => {
        // Regression: ohne Header fiel der Wert auf '' zurück und traf genau die
        // leer gelassene Tabellenzeile — die schreibende API stand damit offen.
        assert.equal(call({ token: undefined }), 401);
        assert.equal(call({ token: '' }), 401);
        assert.equal(call({ token: '   ' }), 401);
        assert.equal(call({ token: undefined, tokenIn: 'body' }), 401);
    });

    it('behandelt leere „Erlaubte Boards" als kein Board, nicht als alle', () => {
        // Regression: '' wurde zu '*' — wer die Liste leerte, um Rechte zu
        // entziehen, vergab sie damit für jedes Board.
        assert.equal(call({ token: 'tok-leer-boards', path: '/boards/familie/cards' }), 403);
        assert.equal(call({ token: 'tok-leer-boards', path: '/boards/agenten/cards' }), 403);
        assert.equal(call({ token: 'tok-leer-boards', path: '/boards' }), 403);
    });

    it('respektiert apiWriteProtection = false', () => {
        assert.equal(call({ token: undefined, config: { apiWriteProtection: false } }), 200);
    });
});

describe('Webhook-Kommandos: Board-Bindung', () => {
    const server = () => new Server(
        { _apiSecret: SPA, config: { inboundTokens: TOKENS }, log: { warn() {}, info() {}, error() {}, debug() {} } },
        {}, async () => ({}),
    );
    const scoped = TOKENS.find(t => t.name === 'agent-fam');
    const open = TOKENS.find(t => t.name === 'agent-all');
    /** null = erlaubt, sonst der HTTP-Code */
    const check = (entry, body) => {
        const r = server().checkActionCommand(entry, body);
        return r ? r.code : null;
    };

    it('lässt unbegrenzte Tokens alles ausführen', () => {
        assert.equal(check(open, { cmd: 'addBoard', title: 'X' }), null);
        assert.equal(check(open, { cmd: 'addCard', board: 'agenten', title: 'X' }), null);
    });

    it('bindet begrenzte Tokens an ihre Boards', () => {
        assert.equal(check(scoped, { cmd: 'addCard', board: 'familie', title: 'X' }), null);
        assert.equal(check(scoped, { cmd: 'addCard', board: 'agenten', title: 'X' }), 403);
        assert.equal(check(scoped, { cmd: 'deleteBoard', board: 'agenten' }), 403);
    });

    it('prüft beim Übertragen auch das Zielboard', () => {
        assert.equal(check(scoped, { cmd: 'transferCard', board: 'familie', toBoard: 'familie' }), null);
        assert.equal(check(scoped, { cmd: 'transferCard', board: 'familie', toBoard: 'agenten' }), 403);
        assert.equal(check(scoped, { cmd: 'transferCard', board: 'familie', targetBoard: 'agenten' }), 403);
    });

    it('verwehrt begrenzten Tokens schreibende Kommandos ohne Board-Angabe', () => {
        // Regression: addBoard nennt kein Board und lief deshalb am Guard vorbei
        assert.equal(check(scoped, { cmd: 'addBoard', title: 'Verbotenes Board' }), 403);
        assert.equal(check(scoped, { cmd: 'irgendwasNeues' }), 403);
    });

    it('lässt sich nicht mit einem erlaubten Board im Body aushebeln', () => {
        // Regression: addBoard ignoriert `board`, der Guard nahm es trotzdem als
        // Nachweis — ein auf 'familie' begrenzter Token legte so Boards an.
        assert.equal(check(scoped, { cmd: 'addBoard', title: 'Neu', board: 'familie' }), 403);
        assert.equal(check(scoped, { cmd: 'addBoard', title: 'Neu', boardId: 'familie' }), 403);
        assert.equal(check(scoped, { cmd: 'addBoard', title: 'Neu', toBoard: 'familie' }), 403);
        // Ebenso darf ein erlaubtes Zielboard das gesperrte Quellboard nicht decken.
        assert.equal(check(scoped, { cmd: 'transferCard', board: 'agenten', toBoard: 'familie' }), 403);
        // Fehlt das maßgebliche Board, lässt sich die Bindung nicht prüfen.
        assert.equal(check(scoped, { cmd: 'addCard', title: 'X' }), 403);
        assert.equal(check(scoped, { cmd: 'transferCard', board: 'familie' }), 403);
    });

    it('lässt lesende Kommandos ohne Board-Angabe zu', () => {
        assert.equal(check(scoped, { cmd: 'listBoards' }), null);
        assert.equal(check(scoped, { cmd: 'getBoards' }), null);
    });
});
