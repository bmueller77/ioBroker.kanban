'use strict';

const utils = require('@iobroker/adapter-core');
const os = require('node:os');
const { EventBus } = require('./lib/events');
const { Store } = require('./lib/store');
const holidays = require('./lib/holidays');
const { Notifier } = require('./lib/notify');
const { Scheduler } = require('./lib/scheduler');
const { cardWithDueAt, boardWithDueAt } = require('./lib/dueat');
const { Server } = require('./lib/server');

class Kanban extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'kanban', useFormatDate: true });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);

        // Vor allem anderen: Benutzer-IDs festschreiben. Schreibt der Adapter
        // dabei seine eigene Konfiguration, startet ihn der js-controller kurz
        // darauf neu - der Rest des Starts laeuft trotzdem weiter, damit die
        // Instanz nicht tot liegenbleibt, falls der Neustart ausbleibt.
        await this._freezeUserIds();

        this.bus = new EventBus();
        this.store = new Store(this, this.bus);
        this.notifier = new Notifier(
            this,
            () => this._baseUrl(),
            () => this._timezone,
        );
        this.notifier.attach(this.bus);
        this.scheduler = new Scheduler(this, this.store, this.bus);
        this.webServer = new Server(this, this.store, (cmd, payload, source) =>
            this.handleCommand(cmd, payload, source),
        );

        // Meta-Objekt für den Dateispeicher (Benutzer-Avatare)
        await this.setForeignObjectNotExistsAsync(this.namespace, {
            type: 'meta',
            common: { name: 'Kanban files (avatars)', type: 'meta.user' },
            native: {},
        });

        // Sprache zuerst: die Papierkorb-Systemspalte wird beim Laden/Migrieren
        // angelegt und braucht dafür den lokalisierten Namen.
        await this._resolveLanguage();
        await this.store.load();
        await this._resolveTimezone();
        await this._initHolidays();
        await this._initApiSecret();

        try {
            this._port = await this.webServer.start();
            await this.setStateAsync('info.connection', true, true);
        } catch (e) {
            this.log.error(`Web server failed to start: ${e.message}`);
            return;
        }

        this.scheduler.start();
        // Der action-State ist eine vollwertige Kommando-Schnittstelle (inkl. Löschen).
        // Wer ihn nicht braucht, kann ihn in den Instanz-Einstellungen abschalten.
        if (this.config.actionStateEnabled === false) {
            this.log.info('action state is disabled - commands are only accepted via REST, webhooks and sendTo.');
        } else {
            await this.subscribeStatesAsync('action');
        }
        await this._reportOrphanedAssignees();
        this.log.info(`Kanban ready - UI: ${this._baseUrl()}/`);
    }

    /**
     * Bereits vergebene Benutzer-IDs festschreiben.
     *
     * Karten, Avatar-Dateien und geteilte Ansichten haengen an der Benutzer-ID.
     * Wird sie in den Einstellungen geaendert, zeigen sie alle ins Leere, und
     * eine Umbenennung laesst sich nicht von "geloescht und neu angelegt"
     * unterscheiden - der Adapter koennte also nicht einmal automatisch
     * aufraeumen. Deshalb sperrt die Tabelle das Feld, sobald `fixed` gesetzt
     * ist. Gesetzt wird es hier, beim ersten Start nach dem Anlegen.
     *
     * @returns {Promise<boolean>} true, wenn die Konfiguration geschrieben wurde
     */
    async _freezeUserIds() {
        const users = Array.isArray(this.config.users) ? this.config.users : [];
        const offen = users.filter(u => u && u.name && !u.fixed).map(u => u.name);
        if (!offen.length) {
            return false;
        }

        // Schutz gegen eine Neustartschleife: Sollte die Admin-Tabelle das
        // Merkmal beim Speichern verwerfen, kaeme es sonst bei jedem Start
        // erneut. Wer schon einmal festgeschrieben wurde, wird nicht noch
        // einmal geschrieben - stattdessen gibt es eine Warnung.
        await this.setObjectNotExistsAsync('info.frozenUserIds', {
            type: 'state',
            common: {
                name: 'User IDs that have been frozen',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '[]',
            },
            native: {},
        });
        const bekannt = await this._frozenUserIds();
        const frisch = offen.filter(n => !bekannt.includes(n));
        if (!frisch.length) {
            this.log.warn(
                `Could not freeze the user ID(s) ${offen.join(', ')}: the marker is not kept by the settings table. ` +
                    'The ID stays editable, and renaming it will detach cards, avatars and shared views.',
            );
            return false;
        }

        await this.setStateAsync('info.frozenUserIds', JSON.stringify([...bekannt, ...frisch]), true);

        // Lesen und ganz zurueckschreiben statt extendObject: Bei Arrays
        // mischen die Varianten von extendObject je nach Version indexweise.
        const id = `system.adapter.${this.namespace}`;
        const obj = await this.getForeignObjectAsync(id);
        if (!obj || !obj.native || !Array.isArray(obj.native.users)) {
            this.log.warn('Could not freeze user IDs: the instance object carries no user list.');
            return false;
        }
        obj.native.users = obj.native.users.map(u => (u && u.name ? { ...u, fixed: true } : u));
        await this.setForeignObjectAsync(id, obj);
        this.log.info(
            `User ID(s) ${frisch.join(', ')} are now fixed and can no longer be renamed in the settings. ` +
                'The adapter restarts once to pick up the change.',
        );
        return true;
    }

    /** Liste der bereits festgeschriebenen IDs aus dem State lesen. */
    async _frozenUserIds() {
        try {
            const st = await this.getStateAsync('info.frozenUserIds');
            const v = JSON.parse((st && st.val) || '[]');
            return Array.isArray(v) ? v : [];
        } catch {
            return [];
        }
    }

    /**
     * Zustaendige melden, die es als Benutzer nicht mehr gibt.
     *
     * Typischer Auslöser: Eine Benutzer-ID wurde in den Instanzeinstellungen
     * umbenannt. Karten speichern die ID, also zeigen sie danach ins Leere. Der
     * Adapter raet nicht, welche alte ID zu welcher neuen gehoert - er meldet
     * den Zustand, umgehaengt wird ausdruecklich mit reassignUser.
     */
    async _reportOrphanedAssignees() {
        await this.setObjectNotExistsAsync('info.orphanedAssignees', {
            type: 'state',
            common: {
                name: 'Assignees without a matching user',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '[]',
            },
            native: {},
        });
        const verwaist = this.store.findOrphanedAssignees();
        await this.setStateAsync('info.orphanedAssignees', JSON.stringify(verwaist), true);
        if (!verwaist.length) {
            return;
        }
        const liste = verwaist.map(o => `'${o.name}' (${o.cards} card(s))`).join(', ');
        this.log.warn(
            `Cards are assigned to users that no longer exist: ${liste}. ` +
                'This usually follows renaming a user ID in the instance settings. ' +
                'Move them over with the command reassignUser {from, to} - the adapter does not guess.',
        );
    }

    /**
     * Sprache ermitteln: Instanz-Einstellung `language` (leer/'auto' = System),
     *  sonst ioBroker-Systemsprache, sonst Englisch.
     */
    async _resolveLanguage() {
        let lang = String(this.config.language || '').toLowerCase();
        if (!lang || lang === 'auto') {
            try {
                const sys = await this.getForeignObjectAsync('system.config');
                lang = (sys && sys.common && sys.common.language) || 'en';
            } catch {
                lang = 'en';
            }
        }
        this._language = lang || 'en';
        this.log.info(`Language: ${this._language}`);
    }

    /**
     * Zeitzone ermitteln (für Kalender-Anhänge). ioBroker führt keine eigene
     *  Zeitzone → System-Zeitzone des Prozesses; falls ioBroker künftig eine
     *  in system.config.common pflegt, hat diese Vorrang.
     */
    async _resolveTimezone() {
        let tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
            const sys = await this.getForeignObjectAsync('system.config');
            const cfgTz = sys && sys.common && (sys.common.timezone || sys.common.tz);
            if (cfgTz) {
                tz = cfgTz;
            }
        } catch {
            /* System-Zeitzone genügt */
        }
        this._timezone = tz || 'Europe/Berlin';
        this.log.info(`Time zone: ${this._timezone}`);
    }

    /**
     * Feiertage für die Arbeitstag-Wiederholungen einrichten. Nutzt – falls
     *  installiert – die Bundesland-Konfiguration des feiertage-Adapters,
     *  sonst die bundesweit einheitlichen gesetzlichen Feiertage.
     */
    async _initHolidays() {
        let native = null;
        try {
            const obj = await this.getForeignObjectAsync('system.adapter.feiertage.0');
            if (obj && obj.native) {
                native = obj.native;
            }
        } catch {
            /* Adapter nicht vorhanden -> Default */
        }
        const info = holidays.configure(native);
        this.log.info(`Public holidays: source ${info.source}, ${info.count} relevant holidays per year`);
    }

    /**
     * Secret für den Schreibschutz der /api-Routen. Wird in index.html als
     *  <meta name="kanban-token"> an die eigene SPA ausgeliefert.
     *
     *  Ab 0.3.0 liegt das Secret im Dateispeicher des Adapters (apisecret.json) statt
     *  im lesbaren State info.apiSecret: Objektzugriff soll nicht automatisch
     *  Schreibzugriff auf die API bedeuten. Der State bleibt aus Kompatibilitätsgründen
     *  bestehen, wird aber leer geführt; ein dort noch vorhandener Wert wird einmalig
     *  übernommen und danach entfernt. Für Skripte sind die Agenten-Tokens der Weg.
     */
    async _initApiSecret() {
        const newSecret = () => require('node:crypto').randomBytes(24).toString('hex');
        try {
            await this.setObjectNotExistsAsync('info.apiSecret', {
                type: 'state',
                common: {
                    name: 'API write secret (deprecated, moved to file storage)',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                },
                native: {},
            });

            let secret = '';
            try {
                const data = await this.readFileAsync(this.namespace, 'apisecret.json');
                const buf = data && data.file !== undefined ? data.file : data;
                const parsed = JSON.parse((Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString('utf8'));
                if (parsed && parsed.secret) {
                    secret = String(parsed.secret);
                }
            } catch {
                /* noch keine Datei -> unten anlegen */
            }

            if (!secret) {
                // Migration: bisher im State abgelegtes Secret übernehmen, sonst neu erzeugen
                const st = await this.getStateAsync('info.apiSecret');
                secret = st && st.val ? String(st.val) : newSecret();
                await this.writeFileAsync(
                    this.namespace,
                    'apisecret.json',
                    Buffer.from(JSON.stringify({ secret }), 'utf8'),
                );
                this.log.info('API secret moved to the file storage; the state info.apiSecret is no longer filled.');
            }

            this._apiSecret = secret;

            // State leeren (einmalig nach der Migration, danach idempotent)
            const cur = await this.getStateAsync('info.apiSecret');
            if (cur && cur.val) {
                await this.setStateAsync('info.apiSecret', '', true);
            }
        } catch (e) {
            this._apiSecret = newSecret();
            this.log.warn(`Could not persist the API secret, using a volatile one: ${e.message}`);
        }
    }

    _baseUrl() {
        const cfg = this.config;
        if (cfg.publicUrl) {
            return String(cfg.publicUrl).replace(/\/+$/, '');
        }
        let ip = '127.0.0.1';
        for (const ifaces of Object.values(os.networkInterfaces())) {
            for (const iface of ifaces || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ip = iface.address;
                    break;
                }
            }
            if (ip !== '127.0.0.1') {
                break;
            }
        }
        return `http://${ip}:${this._port || cfg.port || 8095}`;
    }

    /**
     * Gemeinsamer Kommando-Kern — bedient REST (indirekt), eingehende Webhooks,
     * sendTo('kanban.0', <cmd>, {...}) und den action-State.
     *
     * @param cmd
     * @param payload
     * @param source
     */
    async handleCommand(cmd, payload, source) {
        payload = payload || {};
        const boardId = payload.board || payload.boardId;
        const cardId = payload.cardId || payload.id;
        // Karten-/Board-Antworten tragen wie in der REST-API das berechnete dueAt
        const tz = () => this._timezone || 'Europe/Berlin';
        const card = c => cardWithDueAt(c, tz());
        const board = b => boardWithDueAt(b, tz());
        switch (cmd) {
            case 'listBoards':
            case 'getBoards':
                return this.store.listBoards();
            case 'getBoard': {
                const b = this.store.getBoard(boardId);
                // Nicht still null liefern: ein Skript, das nur den Statuscode prüft,
                // hielte das sonst für einen Erfolg.
                if (!b) {
                    throw new Error(`Board '${boardId}' existiert nicht`);
                }
                return board(b);
            }
            case 'addBoard':
                return this.store.createBoard({ id: payload.id, title: payload.title });
            case 'deleteBoard':
                await this.store.deleteBoard(boardId, source);
                return { ok: true };
            case 'addCard':
                return card(this.store.addCard(boardId, payload, source));
            case 'updateCard':
            case 'editCard':
                return card(this.store.updateCard(boardId, cardId, payload, source));
            case 'moveCard':
                return card(
                    this.store.moveCard(boardId, cardId, payload.column || payload.columnId, payload.order, source),
                );
            case 'doneCard': {
                const b = this.store.getBoard(boardId);
                if (!b) {
                    throw new Error(`Board '${boardId}' existiert nicht`);
                }
                const doneCol = b.columns.find(c => c.isDone);
                if (!doneCol) {
                    throw new Error(`Board '${boardId}' hat keine Erledigt-Spalte`);
                }
                return card(this.store.moveCard(boardId, cardId, doneCol.id, undefined, source));
            }
            case 'deleteCard':
                return card(this.store.deleteCard(boardId, cardId, source));
            case 'restoreCard':
                return card(this.store.restoreCard(boardId, cardId, payload.column || payload.columnId, source));
            case 'purgeCard':
                return card(this.store.purgeCard(boardId, cardId, source));
            case 'emptyTrash':
                return this.store.emptyTrash(boardId, source);
            case 'listOrphanedAssignees':
                return { orphaned: this.store.findOrphanedAssignees() };
            case 'reassignUser':
                return this.store.reassignUser(payload.from, payload.to, source);
            case 'transferCard':
                return card(
                    this.store.transferCard(
                        boardId,
                        cardId,
                        payload.toBoard || payload.targetBoard,
                        payload.toColumn || payload.targetColumn,
                        payload.mode === 'copy' ? 'copy' : 'move',
                        { assignees: payload.assignees },
                        source,
                    ),
                );
            default:
                throw new Error(`Unbekanntes Kommando '${cmd}'`);
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack || !state.val) {
            return;
        }
        if (id !== `${this.namespace}.action`) {
            return;
        }
        if (this.config.actionStateEnabled === false) {
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(state.val);
        } catch (e) {
            this.log.warn(`action state does not contain valid JSON: ${e.message}`);
            await this.setStateAsync('action', '', true);
            return;
        }
        try {
            await this.handleCommand(parsed.cmd, parsed, 'action-state');
            this.log.debug(`action command '${parsed.cmd}' executed`);
        } catch (e) {
            this.log.warn(`action command failed: ${e.message}`);
        }
        await this.setStateAsync('action', '', true);
    }

    async onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }

        // Admin-Button „Token generieren": hängt einen neuen Zufallstoken an die
        // aktuelle Tokens-Tabelle an und gibt sie zurück (Admin schreibt sie ins Feld).
        if (obj.command === 'generateToken') {
            const native = obj.message || {};
            const tokens = Array.isArray(native.inboundTokens) ? native.inboundTokens.slice() : [];
            const token = require('node:crypto').randomBytes(16).toString('hex');
            let name = 'agent';
            for (let i = 1; tokens.some(t => t && t.name === name); i++) {
                name = `agent${i}`;
            }
            tokens.push({ name, token, allowedBoards: '*', enabled: true });
            // jsonConfig übernimmt bei useNative nur ein Feld namens `native` in die
            // Konfiguration; ohne diese Hülle blieb der Button wirkungslos.
            if (obj.callback) {
                this.sendTo(
                    obj.from,
                    obj.command,
                    { native: { inboundTokens: tokens }, saveConfig: true },
                    obj.callback,
                );
            }
            return;
        }

        let result;
        let error;
        try {
            result = await this.handleCommand(obj.command, obj.message || {}, `sendTo:${obj.from || ''}`);
        } catch (e) {
            error = e.message;
        }
        if (obj.callback) {
            this.sendTo(obj.from, obj.command, error ? { error } : result, obj.callback);
        }
    }

    async onUnload(callback) {
        try {
            if (this.scheduler) {
                this.scheduler.stop();
            }
            if (this.webServer) {
                await this.webServer.stop();
            }
            if (this.store) {
                await this.store.flush();
            }
            await this.setStateAsync('info.connection', false, true);
        } catch {
            // ignorieren — wir fahren ohnehin herunter
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new Kanban(options);
} else {
    new Kanban();
}
