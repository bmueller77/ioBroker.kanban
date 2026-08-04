'use strict';

const { todayStr } = require('./store');

/** Aktuelle Ortszeit als HH:MM. */
function nowHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Fälligkeits-/Erinnerungs-Check.
 * 60-s-Tick: aktualisiert Spiegel-States; wenn die Uhrzeit reminderTime (HH:MM)
 * erreicht ist, werden für fällige Karten cardDue-Events emittiert.
 * Zusätzlich ein Lauf 30 s nach Adapterstart (falls reminderTime verpasst wurde,
 * werden nur Karten erinnert, deren lastReminderAt nicht heute ist).
 */
class Scheduler {
    constructor(adapter, store, bus) {
        this.adapter = adapter;
        this.store = store;
        this.bus = bus;
        this._interval = null;
        this._startupTimer = null;
        this._lastMinute = '';
        this._lastCleanupDay = '';
    }

    start() {
        this._interval = this.adapter.setInterval(() => this._tick(), 60 * 1000);
        this._startupTimer = this.adapter.setTimeout(() => {
            this._runDueCheck(true).catch(e => this.adapter.log.error(`Due check: ${e.message}`));
            this._runCleanup().catch(e => this.adapter.log.error(`Cleanup: ${e.message}`));
            // Uhrzeit-Fälligkeiten des laufenden Tages nachholen, die während eines
            // Neustarts oder einer Ausfallzeit verpasst wurden
            this._runExactDueCheck(nowHHMM()).catch(e => this.adapter.log.error(`Exact due check: ${e.message}`));
        }, 30 * 1000);
    }

    stop() {
        if (this._interval) {
            this.adapter.clearInterval(this._interval);
        }
        if (this._startupTimer) {
            this.adapter.clearTimeout(this._startupTimer);
        }
        this._interval = null;
        this._startupTimer = null;
    }

    _tick() {
        this.store.updateMirrors().catch(e => this.adapter.log.error(`Mirror states: ${e.message}`));
        const hhmm = nowHHMM();
        if (hhmm === this._lastMinute) {
            return;
        }
        this._lastMinute = hhmm;
        if (hhmm === (this.adapter.config.reminderTime || '08:00')) {
            this._runDueCheck(false).catch(e => this.adapter.log.error(`Due check: ${e.message}`));
        }
        // Kartengenaue Fälligkeit (optional): jede Minute prüfen
        this._runExactDueCheck(hhmm).catch(e => this.adapter.log.error(`Exact due check: ${e.message}`));
        // Aufräumen einmal täglich (beim ersten Tick eines neuen Kalendertags)
        const day = todayStr();
        if (day !== this._lastCleanupDay) {
            this._runCleanup().catch(e => this.adapter.log.error(`Cleanup: ${e.message}`));
        }
    }

    /** Automatischen Aufräumlauf ausführen und die gebündelte E-Mail-Zusammenfassung verschicken. */
    async _runCleanup() {
        this._lastCleanupDay = todayStr();
        const results = this.store.runCleanup(Date.now());
        const moved = results.reduce((n, r) => n + r.moved.length, 0);
        const purged = results.reduce((n, r) => n + r.purged.length, 0);
        if (moved || purged) {
            this.adapter.log.info(`Cleanup: ${moved} card(s) moved to the trash, ${purged} permanently removed`);
            if (this.adapter.notifier && this.adapter.notifier.sendCleanupSummary) {
                await this.adapter.notifier.sendCleanupSummary(results);
            }
        }
    }

    /**
     * Kartengenaue Fälligkeit (Instanz-Option „Fällig-Ereignis zur Uhrzeit").
     * Für Karten mit gesetzter Uhrzeit wird ein zusätzliches cardDue-Ereignis mit
     * `detail.exact = true` ausgelöst, sobald die Uhrzeit erreicht ist – unabhängig
     * von der täglichen Erinnerungs-Uhrzeit. `lastExactAt` (Datum) verhindert
     * Wiederholungen und holt eine verpasste Minute (z. B. Adapterstart) am
     * gleichen Tag nach.
     *
     * @param hhmm aktuelle Uhrzeit als HH:MM
     */
    async _runExactDueCheck(hhmm) {
        if (!this.adapter.config.dueExact) {
            return;
        }
        const today = todayStr();
        let count = 0;
        for (const board of this.store.boards.values()) {
            let touched = false;
            for (const card of board.cards) {
                if (!card.due || !card.dueTime) {
                    continue;
                }
                if (card.due !== today || card.dueTime > hhmm) {
                    continue;
                }
                if (card.lastExactAt === today) {
                    continue;
                }
                if (this.store._isDoneColumn(board, card.columnId)) {
                    continue;
                }
                if (this.store._isTrashColumn(board, card.columnId)) {
                    continue;
                }
                card.lastExactAt = today;
                touched = true;
                count++;
                this.bus.emitEvent('cardDue', {
                    board: { id: board.id, title: board.title },
                    card,
                    detail: { due: card.due, dueTime: card.dueTime, exact: true, overdue: false },
                });
            }
            if (touched) {
                board.rev++;
                this.store._schedulePersist(board.id);
                if (this.store.onChange) {
                    this.store.onChange(board.id, board.rev);
                }
            }
        }
        if (count) {
            this.adapter.log.info(`Exact due check: ${count} event(s) fired`);
        }
    }

    /**
     * @param startup true = Lauf nach Adapterstart: nur nachholen, wenn reminderTime
     *                heute schon vorbei ist (sonst würde die Erinnerung zu früh kommen)
     */
    async _runDueCheck(startup) {
        const cfg = this.adapter.config;
        if (startup) {
            const now = new Date();
            const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            if (hhmm < (cfg.reminderTime || '08:00')) {
                return;
            }
        }
        const daysBefore = Number(cfg.reminderDaysBefore) || 0;
        const threshold = new Date();
        threshold.setDate(threshold.getDate() + daysBefore);
        const thresholdStr = `${threshold.getFullYear()}-${String(threshold.getMonth() + 1).padStart(2, '0')}-${String(threshold.getDate()).padStart(2, '0')}`;
        const today = todayStr();

        let count = 0;
        for (const board of this.store.boards.values()) {
            let touched = false;
            for (const card of board.cards) {
                if (!card.due || card.due > thresholdStr) {
                    continue;
                }
                if (this.store._isDoneColumn(board, card.columnId)) {
                    continue;
                }
                if (this.store._isTrashColumn(board, card.columnId)) {
                    continue;
                }
                if (card.lastReminderAt === today) {
                    continue;
                }
                card.lastReminderAt = today;
                touched = true;
                count++;
                this.bus.emitEvent('cardDue', {
                    board: { id: board.id, title: board.title },
                    card,
                    detail: { due: card.due, overdue: card.due < today },
                });
            }
            if (touched) {
                board.rev++;
                this.store._schedulePersist(board.id);
                if (this.store.onChange) {
                    this.store.onChange(board.id, board.rev);
                }
            }
        }
        if (count) {
            this.adapter.log.info(`Due check: ${count} reminder(s) fired`);
        }
    }
}

module.exports = { Scheduler };
