'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { TRASH_RETENTION_DAYS, nextCronDates } = require('./store');
const { validateCron } = require('./cron');
const { cardWithDueAt, boardWithDueAt } = require('./dueat');

/** Rein lesende Kommandos: für board-begrenzte Tokens auch ohne Board-Angabe erlaubt,
 *  weil Lesen am Adapter ohnehin nicht token-pflichtig ist. Alles andere ohne
 *  Board-Angabe ist für solche Tokens gesperrt (secure by default). */
const READ_COMMANDS = new Set(['listBoards', 'getBoards', 'getBoard']);

/** Welche Body-Felder benennen bei einem Kommando das tatsaechlich betroffene Board?
 *  Nur diese Felder duerfen die Board-Bindung eines Tokens erfuellen. Sonst genuegt
 *  ein beliebiges erlaubtes Board irgendwo im Body, um sie auszuhebeln: `addBoard`
 *  etwa liest `board` gar nicht und legte trotzdem ein fremdes Board an.
 *  `source`/`target` spiegeln die Aufloesung in main.js handleCommand wider.
 *  Kommandos ohne Eintrag (addBoard, Unbekanntes) fassen kein bestimmtes Board an
 *  und bleiben board-begrenzten Tokens verwehrt. */
const COMMAND_BOARDS = {
    deleteBoard: { source: true },
    addCard: { source: true },
    updateCard: { source: true },
    editCard: { source: true },
    moveCard: { source: true },
    doneCard: { source: true },
    deleteCard: { source: true },
    restoreCard: { source: true },
    purgeCard: { source: true },
    emptyTrash: { source: true },
    transferCard: { source: true, target: true },
};

/**
 * HTTP-Server des Adapters: statisches Frontend (www/), REST-API (/api),
 * eingehende Webhooks (/webhook/:token) und WebSocket (/ws) für Live-Sync.
 * Bewusst KEINE Frame-/CSP-Header, damit die iframe-Einbindung (Lovelace) frei ist.
 */
class Server {
    /**
     * @param adapter ioBroker-Adapter
     * @param store Store aus store.js
     * @param handleCommand (cmd, payload, source) => Promise<any> — gemeinsamer Kommando-Kern
     */
    constructor(adapter, store, handleCommand) {
        this.adapter = adapter;
        this.store = store;
        this.handleCommand = handleCommand;
        this.server = null;
        this.wss = null;
    }

    // Ausgabe-Aufbereitung: jedes Kartenobjekt der API traegt zusaetzlich das
    // berechnete Feld dueAt (Faelligkeit inkl. Uhrzeit mit lokalem Offset).
    _tz() { return this.adapter._timezone || 'Europe/Berlin'; }
    _pubCard(card) { return cardWithDueAt(card, this._tz()); }
    _pubBoard(board) { return boardWithDueAt(board, this._tz()); }

    async start() {
        const cfg = this.adapter.config;
        const app = express();
        app.use(express.json({ limit: '1mb' }));

        // CORS nur auf den Integrationsrouten und nur fuer ausdruecklich erlaubte
        // Origins. Zuvor stand `Access-Control-Allow-Origin: *` auf allen Routen —
        // damit konnte jede fremde Seite `GET /` cross-origin lesen und den dort im
        // <meta>-Tag eingebetteten Schreib-Token abgreifen. Die Board-UI selbst
        // braucht kein CORS (same-origin), die iframe-Einbindung ebenfalls nicht.
        // Leere Liste (Standard) = kein CORS. Server-seitige Integrationen (Skripte,
        // Node-RED, curl) sind davon nicht betroffen: CORS ist reine Browser-Mechanik.
        const corsOrigins = String(cfg.corsOrigins || '')
            .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
        const corsAny = corsOrigins.includes('*');
        app.use(['/api', '/webhook'], (req, res, next) => {
            const origin = req.get('Origin');
            if (origin && (corsAny || corsOrigins.includes(origin.replace(/\/+$/, '')))) {
                // Origin zurueckspiegeln statt `*`: bleibt gueltig, wenn spaeter
                // Cookies dazukommen (Wildcard und Credentials schliessen sich aus).
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Kanban-Token');
                res.setHeader('Access-Control-Max-Age', '600');
            }
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            next();
        });

        // Board-UI mit eingebettetem Schreib-Token ausliefern (CSP-konform via <meta>, kein Inline-Script)
        const indexHtml = path.join(__dirname, '..', 'www', 'index.html');
        app.get(['/', '/index.html'], (req, res) => {
            fs.readFile(indexHtml, 'utf8', (err, html) => {
                if (err) return res.status(500).end();
                const meta = `<meta name="kanban-token" content="${this.adapter._apiSecret || ''}">`;
                res.type('html').set('Cache-Control', 'no-cache').send(html.replace('</head>', `${meta}\n</head>`));
            });
        });

        // Schreibende /api-Zugriffe brauchen einen Token (Lesen bleibt offen).
        app.use('/api', (req, res, next) => this._guardApiWrite(req, res, next));

        this._apiRoutes(app);
        this._webhookRoutes(app);

        app.use('/', express.static(path.join(__dirname, '..', 'www'), {
            setHeaders: (res, filePath) => {
                // SPA-Assets immer revalidieren → keine veralteten HTML/JS-Mischzustände
                if (/\.(html|js|mjs|json|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
            },
        }));

        this.server = http.createServer(app);
        this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
        this.wss.on('connection', ws => {
            ws.isAlive = true;
            ws.on('pong', () => { ws.isAlive = true; });
            ws.on('error', () => {});
        });
        this._pingInterval = setInterval(() => {
            for (const ws of this.wss.clients) {
                if (!ws.isAlive) { ws.terminate(); continue; }
                ws.isAlive = false;
                ws.ping();
            }
        }, 30 * 1000);

        // Store-Änderungen an alle offenen Ansichten broadcasten
        this.store.onChange = (boardId, rev) => this.broadcast({ type: 'dirty', boardId, rev });

        const port = await this.adapter.getPortAsync(cfg.port || 8095);
        if (port !== (cfg.port || 8095)) {
            // Gewolltes Ausweichverhalten, kein Defekt: als Warnung loggen, sonst
            // erzeugt ioBroker eine Fehlerbenachrichtigung.
            this.adapter.log.warn(`Port ${cfg.port} is in use - falling back to free port ${port}. `
                + 'The instance list still shows the configured port; enter the free port there to keep both in sync.');
        }
        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, cfg.bind || '0.0.0.0', () => resolve());
        });
        this.adapter.log.info(`Web server listening on ${cfg.bind || '0.0.0.0'}:${port}`);
        return port;
    }

    broadcast(msg) {
        if (!this.wss) return;
        const data = JSON.stringify(msg);
        for (const ws of this.wss.clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
    }

    async stop() {
        if (this._pingInterval) clearInterval(this._pingInterval);
        if (this.wss) {
            for (const ws of this.wss.clients) ws.terminate();
            this.wss.close();
        }
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
        }
    }

    // ------------------------------------------------------------ REST-API

    /** Schreibzugriffe (POST/PATCH/DELETE) auf /api brauchen den SPA-Token
     *  (in index.html als <meta> injiziert) oder einen gültigen inboundToken.
     *  GET/HEAD/OPTIONS bleiben offen. Abschaltbar über native.apiWriteProtection=false.
     *  Agenten-Tokens gelten hier mit derselben Board-Bindung wie am Webhook:
     *  ein auf Boards begrenzter Token darf über /api nichts anderes anfassen. */
    _guardApiWrite(req, res, next) {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
        if (this.adapter.config.apiWriteProtection === false) return next();
        // Bewusst kein Query-Parameter: Tokens in URLs landen in Logs, History und Referrern.
        const tok = String(req.get('X-Kanban-Token') || (req.body && req.body._token) || '').trim();
        if (!tok) {
            this.adapter.log.warn(`Write access to ${req.originalUrl} without a token from ${req.ip}`);
            return res.status(401).json({ error: 'write requires token' });
        }
        if (tok === this.adapter._apiSecret) return next();
        const entry = this._findToken(tok);
        if (entry) {
            req.tokenEntry = entry;
            return this._guardTokenScope(req, res, next);
        }
        this.adapter.log.warn(`Write access to ${req.originalUrl} without a valid token from ${req.ip}`);
        return res.status(401).json({ error: 'write requires token' });
    }

    /** Token-Zeile zu einem Wert suchen. Zeilen ohne Token werden uebersprungen:
     *  sonst passt eine leer gelassene Tabellenzeile auf jeden Aufruf ohne Token
     *  und macht die schreibende API offen. */
    _findToken(value) {
        const tok = String(value || '').trim();
        if (!tok) return null;
        return (this.adapter.config.inboundTokens || [])
            .find(t => t && t.enabled !== false && String(t.token || '').trim() === tok) || null;
    }

    /** Ist der Token auf bestimmte Boards begrenzt? Nur ein ausdrueckliches '*'
     *  heisst "alle Boards". Ein leeres Feld galt frueher ebenfalls als '*' — wer
     *  die Liste leerte, um Rechte zu entziehen, vergab sie damit fuer alles. */
    _tokenScoped(entry) {
        return String((entry && entry.allowedBoards) || '').trim() !== '*';
    }

    /** Board-Bindung eines Agenten-Tokens auf den /api-Routen durchsetzen.
     *  Geprüft werden das Board aus dem Pfad (/api/boards/<id>/...) und alle
     *  Board-Angaben im Body (u. a. das Ziel beim Übertragen). */
    _guardTokenScope(req, res, next) {
        const entry = req.tokenEntry;
        if (!this._tokenScoped(entry)) return next();

        // Massgeblich ist allein die Route: Welches Board fasst dieser Aufruf an?
        // Beliebige Board-Felder im Body werden hier bewusst NICHT ausgewertet —
        // sonst genuegt ein erlaubtes Board irgendwo im Body, um die Begrenzung
        // auszuhebeln (`POST /api/boards {"title":"X","board":"erlaubt"}` legte so
        // ein fremdes Board an, weil createBoard das Feld gar nicht liest).
        const targets = new Set();
        const m = /^\/boards\/([^/?]+)/.exec(req.path || '');
        if (m) {
            let boardId;
            try {
                boardId = decodeURIComponent(m[1]);
            } catch (e) {
                return res.status(400).json({ error: 'Ungueltige Board-ID in der Adresse' });
            }
            targets.add(boardId);
            // Beim Uebertragen ist zusaetzlich das Zielboard betroffen. `targetBoard`
            // liest die Route zwar nicht, wird aber mitgeprueft: zusaetzliche Ziele
            // koennen nur strenger machen, nie die Bindung erfuellen.
            if (/\/transfer$/.test(req.path)) {
                const body = req.body || {};
                for (const key of ['toBoard', 'targetBoard']) {
                    if (body[key]) targets.add(String(body[key]));
                }
            }
        }

        if (!targets.size) {
            // Nicht board-bezogene Schreibrouten (Board anlegen, Benutzer/Avatare)
            // bleiben begrenzten Tokens verwehrt.
            this.adapter.log.warn(`Token '${entry.name || '?'}' may not perform ${req.method} ${req.originalUrl} (limited to specific boards)`);
            return res.status(403).json({ error: 'token is limited to specific boards' });
        }
        for (const boardId of targets) {
            if (!this._boardAllowed(entry, boardId)) {
                this.adapter.log.warn(`Token '${entry.name || '?'}' may not modify board '${boardId}' (${req.method} ${req.originalUrl})`);
                return res.status(403).json({ error: `Token darf Board '${boardId}' nicht ändern` });
            }
        }
        return next();
    }

    _apiRoutes(app) {
        const wrap = fn => (req, res) => {
            Promise.resolve(fn(req, res)).catch(e => {
                const code = /existiert nicht/.test(e.message) ? 404 : 400;
                res.status(code).json({ error: e.message });
            });
        };

        app.get('/api/config', wrap(async (req, res) => {
            const cfg = this.adapter.config;
            res.json({
                users: await this._publicUsers(),
                themeDefault: cfg.themeDefault || 'auto',
                accentColor: cfg.accentColor || '#7E57C2',
                dateFormat: cfg.dateFormat || this.adapter.dateFormat || 'DD.MM.',
                timeFormat: cfg.timeFormat || '24h',
                language: this.adapter._language || 'en',
                trashRetentionDays: TRASH_RETENTION_DAYS,
            });
        }));

        // Cron-Muster prüfen: liefert Gültigkeit, erzwungene Uhrzeit und die nächsten
        // Termine. Reine Rechenoperation, daher wie alle GET-Routen ohne Token.
        app.get('/api/cron/check', (req, res) => {
            const check = validateCron(req.query.expr || '');
            if (!check.ok) return res.json({ ok: false, error: check.error });
            res.json({ ok: true, time: check.time, next: nextCronDates(req.query.expr, 3) });
        });

        app.get('/api/custom.css', (req, res) => {
            res.type('text/css').send(this.adapter.config.customCss || '');
        });

        app.get('/api/users', wrap(async (req, res) => {
            res.json(await this._publicUsers());
        }));

        // ---- Benutzer-Avatare (Bild-Upload; abgelegt im ioBroker-Dateispeicher) ----
        app.get('/avatars/:name', wrap(async (req, res) => {
            const name = String(req.params.name).replace(/[^a-z0-9_-]/gi, '');
            try {
                const data = await this.adapter.readFileAsync(this.adapter.namespace, `avatars/${name}.png`);
                const buf = data && data.file !== undefined ? data.file : data;
                res.type('image/png').set('Cache-Control', 'no-cache')
                    .send(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
            } catch (e) {
                res.status(404).end();
            }
        }));

        app.post('/api/users/:name/avatar', wrap(async (req, res) => {
            const name = String(req.params.name);
            if (!(this.adapter.config.users || []).some(u => u.name === name)) {
                return res.status(404).json({ error: 'Benutzer unbekannt' });
            }
            const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec((req.body || {}).image || '');
            if (!m) return res.status(400).json({ error: 'Ungültiges Bild' });
            const buf = Buffer.from(m[2], 'base64');
            if (buf.length > 512 * 1024) return res.status(413).json({ error: 'Bild zu groß' });
            await this.adapter.writeFileAsync(this.adapter.namespace, `avatars/${name.replace(/[^a-z0-9_-]/gi, '')}.png`, buf);
            res.json({ ok: true });
        }));

        app.delete('/api/users/:name/avatar', wrap(async (req, res) => {
            const name = String(req.params.name).replace(/[^a-z0-9_-]/gi, '');
            try { await this.adapter.delFileAsync(this.adapter.namespace, `avatars/${name}.png`); } catch (e) { /* egal */ }
            res.json({ ok: true });
        }));

        // Benutzer-Farbe setzen (Laufzeit; im ioBroker-Dateispeicher, ohne Adapter-Neustart)
        app.patch('/api/users/:name', wrap(async (req, res) => {
            const name = String(req.params.name);
            if (!(this.adapter.config.users || []).some(u => u.name === name)) {
                return res.status(404).json({ error: 'Benutzer unbekannt' });
            }
            const body = req.body || {};
            const colors = await this._readUserColors();
            if (body.color !== undefined) {
                const c = String(body.color);
                if (!/^#[0-9a-fA-F]{3,8}$/.test(c)) return res.status(400).json({ error: 'Ungueltige Farbe' });
                colors[name] = c;
            }
            await this._writeUserColors(colors);
            res.json({ ok: true });
        }));

        app.get('/api/boards', (req, res) => res.json(this.store.listBoards()));

        app.post('/api/boards', wrap(async (req, res) => {
            const board = await this.store.createBoard(req.body || {});
            res.status(201).json(board);
        }));

        app.get('/api/boards/:id', wrap(async (req, res) => {
            const board = this.store.getBoard(req.params.id);
            if (!board) return res.status(404).json({ error: `Board '${req.params.id}' existiert nicht` });
            if (req.query.rev !== undefined && Number(req.query.rev) === board.rev) {
                return res.json({ unchanged: true, rev: board.rev });
            }
            res.json(this._pubBoard(board));
        }));

        app.patch('/api/boards/:id', wrap(async (req, res) => {
            res.json(this._pubBoard(this.store.updateBoard(req.params.id, req.body || {})));
        }));

        app.delete('/api/boards/:id', wrap(async (req, res) => {
            await this.store.deleteBoard(req.params.id, (req.body && req.body.by) || 'api');
            res.json({ ok: true });
        }));

        app.post('/api/boards/:id/cards', wrap(async (req, res) => {
            const card = this.store.addCard(req.params.id, req.body || {}, (req.body && req.body.by) || 'api');
            res.status(201).json(this._pubCard(card));
        }));

        app.patch('/api/boards/:id/cards/:cardId', wrap(async (req, res) => {
            res.json(this._pubCard(this.store.updateCard(req.params.id, req.params.cardId, req.body || {}, (req.body && req.body.by) || 'api')));
        }));

        app.post('/api/boards/:id/cards/:cardId/move', wrap(async (req, res) => {
            const { columnId, order, by } = req.body || {};
            res.json(this._pubCard(this.store.moveCard(req.params.id, req.params.cardId, columnId, order, by || 'api')));
        }));

        app.delete('/api/boards/:id/cards/:cardId', wrap(async (req, res) => {
            res.json(this._pubCard(this.store.deleteCard(req.params.id, req.params.cardId, 'api')));
        }));

        // Papierkorb: Wiederherstellen, endgültig löschen, leeren
        app.post('/api/boards/:id/cards/:cardId/restore', wrap(async (req, res) => {
            const { columnId, by } = req.body || {};
            res.json(this._pubCard(this.store.restoreCard(req.params.id, req.params.cardId, columnId, by || 'api')));
        }));

        app.post('/api/boards/:id/cards/:cardId/purge', wrap(async (req, res) => {
            res.json(this._pubCard(this.store.purgeCard(req.params.id, req.params.cardId, (req.body && req.body.by) || 'api')));
        }));

        app.post('/api/boards/:id/trash/empty', wrap(async (req, res) => {
            res.json(this.store.emptyTrash(req.params.id, (req.body && req.body.by) || 'api'));
        }));

        // Karte auf ein anderes Board kopieren/verschieben
        app.post('/api/boards/:id/cards/:cardId/transfer', wrap(async (req, res) => {
            const { toBoard, toColumn, mode, assignees, by } = req.body || {};
            res.json(this._pubCard(this.store.transferCard(req.params.id, req.params.cardId, toBoard, toColumn,
                mode === 'copy' ? 'copy' : 'move', { assignees }, by || 'api')));
        }));
    }

    // ------------------------------------------------------------ Eingehende Webhooks

    _checkToken(req) {
        return this._findToken(req.params.token);
    }

    _boardAllowed(entry, boardId) {
        const s = String((entry && entry.allowedBoards) || '').trim();
        if (s === '*') return true;
        if (!s) return false;   // leere Liste = kein Board, nicht alle
        return s.split(/[\s,;]+/).includes(boardId);
    }

    /** Darf dieser Token das Kommando ausführen? Prüft jede Board-Angabe im Body
     *  (board, boardId, toBoard, targetBoard). Nennt ein schreibendes Kommando gar
     *  kein Board — etwa addBoard —, ist es für einen auf Boards begrenzten Token
     *  gesperrt, weil sich die Begrenzung sonst umgehen liesse.
     *  @returns null wenn erlaubt, sonst { code, error } */
    checkActionCommand(entry, body) {
        body = body || {};
        if (!this._tokenScoped(entry)) return null;

        const cmd = String(body.cmd || '');
        // Lesen ist am Adapter ohnehin nicht token-pflichtig.
        if (READ_COMMANDS.has(cmd)) return null;

        const spec = COMMAND_BOARDS[cmd];
        if (!spec) {
            return { code: 403, error: 'token is limited to specific boards' };
        }
        const targets = [];
        if (spec.source) targets.push(body.board || body.boardId);
        if (spec.target) targets.push(body.toBoard || body.targetBoard);
        for (const raw of targets) {
            // Fehlt das massgebliche Board, laesst sich die Bindung nicht pruefen.
            if (!raw) return { code: 403, error: 'token is limited to specific boards' };
            const boardId = String(raw);
            if (!this._boardAllowed(entry, boardId)) {
                return { code: 403, error: `Token darf Board '${boardId}' nicht ändern` };
            }
        }
        return null;
    }

    /** Benutzerliste für die Oberfläche. Zeilen ohne ID werden verworfen — sie
     *  erscheinen sonst als Mitglied „null" und lassen sich nicht sinnvoll zuweisen. */
    async _publicUsers() {
        const colors = await this._readUserColors();
        const rows = (this.adapter.config.users || []).filter(u => u && String(u.name || '').trim());
        return Promise.all(rows.map(async u => ({
            name: u.name,
            displayName: u.displayName,
            color: colors[u.name] || u.color || this._defaultColor(u.name),
            avatar: await this._avatarExists(u.name),
        })));
    }

    async _avatarExists(name) {
        const n = String(name).replace(/[^a-z0-9_-]/gi, '');
        try { return !!(await this.adapter.fileExistsAsync(this.adapter.namespace, `avatars/${n}.png`)); }
        catch (e) { return false; }
    }

    async _readUserColors() {
        try {
            const data = await this.adapter.readFileAsync(this.adapter.namespace, 'usercolors.json');
            const buf = data && data.file !== undefined ? data.file : data;
            return JSON.parse((Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString('utf8')) || {};
        } catch (e) { return {}; }
    }

    async _writeUserColors(map) {
        await this.adapter.writeFileAsync(this.adapter.namespace, 'usercolors.json', Buffer.from(JSON.stringify(map), 'utf8'));
    }

    _defaultColor(name) {
        const pal = ['#e91e63', '#2196f3', '#00bcd4', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#3f51b5', '#009688', '#795548'];
        let h = 0; const s = String(name || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return pal[h % pal.length];
    }

    _webhookRoutes(app) {
        const router = express.Router({ mergeParams: true });

        router.use((req, res, next) => {
            const entry = this._checkToken(req);
            if (!entry) {
                this.adapter.log.warn(`Webhook with an invalid token from ${req.ip}`);
                return res.status(401).json({ error: 'invalid token' });
            }
            req.tokenEntry = entry;
            next();
        });

        const wrap = fn => (req, res) => {
            Promise.resolve(fn(req, res)).catch(e => {
                const code = /existiert nicht/.test(e.message) ? 404 : 400;
                res.status(code).json({ error: e.message });
            });
        };

        const guardBoard = (req, res, boardId) => {
            if (!this._boardAllowed(req.tokenEntry, boardId)) {
                res.status(403).json({ error: `Token darf Board '${boardId}' nicht ändern` });
                return false;
            }
            return true;
        };

        router.post('/boards/:id/cards', wrap(async (req, res) => {
            if (!guardBoard(req, res, req.params.id)) return;
            const source = `webhook:${req.tokenEntry.name || 'token'}`;
            res.status(201).json(this._pubCard(this.store.addCard(req.params.id, req.body || {}, source)));
        }));

        const updateHandler = wrap(async (req, res) => {
            if (!guardBoard(req, res, req.params.id)) return;
            const source = `webhook:${req.tokenEntry.name || 'token'}`;
            res.json(this._pubCard(this.store.updateCard(req.params.id, req.params.cardId, req.body || {}, source)));
        });
        router.patch('/boards/:id/cards/:cardId', updateHandler);
        router.post('/boards/:id/cards/:cardId', updateHandler);

        router.post('/boards/:id/cards/:cardId/move', wrap(async (req, res) => {
            if (!guardBoard(req, res, req.params.id)) return;
            const { columnId, order } = req.body || {};
            const source = `webhook:${req.tokenEntry.name || 'token'}`;
            res.json(this._pubCard(this.store.moveCard(req.params.id, req.params.cardId, columnId, order, source)));
        }));

        // Generische Aktion: gleiches Kommando-Vokabular wie sendTo/action-State
        router.post('/action', wrap(async (req, res) => {
            const body = req.body || {};
            const denied = this.checkActionCommand(req.tokenEntry, body);
            if (denied) {
                this.adapter.log.warn(`Token '${req.tokenEntry.name || '?'}' denied for command '${body.cmd}': ${denied.error}`);
                return res.status(denied.code).json({ error: denied.error });
            }
            const source = `webhook:${req.tokenEntry.name || 'token'}`;
            const result = await this.handleCommand(body.cmd, body, source);
            res.json(result === undefined ? { ok: true } : result);
        }));

        app.use('/webhook/:token', router);
    }
}

module.exports = { Server };
