// REST-Wrapper + WebSocket mit Reconnect und Polling-Fallback

import { t } from './i18n.js';

// Zeitgrenze fuer einen Aufruf. Ohne sie wartet fetch beliebig lange, wenn der
// Adapter mitten im Speichern verschwindet - der Dialog haengt dann, und die
// Fehlermeldung, die es laengst gibt, kommt nie (Befund 25 aus dem Abnahmetest).
const TIMEOUT_MS = 15000;

// Schreib-Token: vom Server in index.html injiziert (<meta name="kanban-token">).
// Die Abfrage ist gegen ein fehlendes document abgesichert, damit sich das Modul
// auch ausserhalb des Browsers laden laesst — board.js importiert es, und board.js
// wird in den Tests geladen.
const WRITE_TOKEN = typeof document !== 'undefined'
    ? ((document.querySelector('meta[name="kanban-token"]') || {}).content || '')
    : '';

export async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
    }
    if (init.method !== 'GET' && WRITE_TOKEN) init.headers['X-Kanban-Token'] = WRITE_TOKEN;

    // AbortController fehlt nur in sehr alten Umgebungen; dort laeuft es wie
    // bisher weiter, statt am fehlenden Konstruktor zu scheitern.
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let frist = null;
    if (ctl) {
        init.signal = ctl.signal;
        frist = setTimeout(() => ctl.abort(), Number(opts.timeoutMs) || TIMEOUT_MS);
    }
    let res;
    try {
        res = await fetch(path, init);
    } catch {
        // Abbruch und Netzfehler sind fuer den Aufrufer dasselbe: Der Adapter
        // war nicht erreichbar. Die Meldung sagt das, statt 'Failed to fetch'.
        throw new Error(t('error.noAnswer'));
    } finally {
        if (frist) clearTimeout(frist);
    }
    if (!res.ok) {
        let msg = res.statusText;
        try { msg = (await res.json()).error || msg; } catch { /* leer */ }
        throw new Error(msg);
    }
    return res.json();
}

/**
 * Live-Sync: WebSocket auf /ws; bei 'dirty' wird onDirty(boardId, rev) gerufen.
 * Fällt der WS aus, greift alle 10 s ein Polling-Callback (onPoll).
 */
export function liveSync(onDirty, onPoll) {
    let ws = null;
    let retryMs = 1000;
    let timer = null;      // genau eine Reconnect-Kette, egal wie viele Events kommen

    const isOpen = () => ws && ws.readyState === WebSocket.OPEN;

    function connect() {
        timer = null;
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let sock;
        try {
            sock = new WebSocket(`${proto}//${location.host}/ws`);
        } catch {
            scheduleReconnect();
            return;
        }
        ws = sock;
        sock.onopen = () => { if (ws === sock) retryMs = 1000; };
        sock.onmessage = ev => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'dirty') onDirty(msg.boardId, msg.rev);
            } catch { /* ignorieren */ }
        };
        // Nur der aktuelle Socket darf einen Reconnect auslösen — ein verspätetes
        // close eines abgelösten Sockets würde sonst die Kette durcheinanderbringen.
        sock.onclose = () => { if (ws === sock) scheduleReconnect(); };
        sock.onerror = () => { try { sock.close(); } catch { /* leer */ } };
    }

    function scheduleReconnect(delay) {
        if (timer) return;
        timer = setTimeout(connect, delay === undefined ? retryMs : delay);
        retryMs = Math.min(retryMs * 2, 15000);
    }

    /** Sofort neu verbinden und abgleichen — nach Tabwechsel, Netzwechsel oder
     *  wenn der Wachhund merkt, dass die Verbindung weg ist. */
    function revive() {
        retryMs = 1000;
        if (!isOpen()) {
            if (timer) { clearTimeout(timer); timer = null; }
            connect();
        }
        onPoll();
    }

    connect();

    // Sicherheitsnetz 1: Wachhund. Verlässt sich nicht auf close-Events, sondern
    // schaut selbst nach dem Zustand — nach einem Adapter-Neustart bleibt sonst
    // eine tote Verbindung unbemerkt stehen.
    setInterval(() => {
        if (document.hidden) return;
        if (!isOpen()) { scheduleReconnect(0); onPoll(); }
    }, 10000);

    // Sicherheitsnetz 2: auch bei offener Verbindung regelmäßig abgleichen. Dank
    // ?rev= kostet das fast nichts und fängt verlorene Nachrichten auf.
    setInterval(() => { if (!document.hidden && isOpen()) onPoll(); }, 60000);

    // Sicherheitsnetz 3: Ereignisse, nach denen eine Verbindung typischerweise tot ist
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revive(); });
    window.addEventListener('online', revive);
    window.addEventListener('pageshow', ev => { if (ev.persisted) revive(); });
}
