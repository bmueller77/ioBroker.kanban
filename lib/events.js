'use strict';

const { EventEmitter } = require('node:events');

/**
 * Zentraler Event-Bus des Adapters.
 * Ereignistypen: cardCreated | cardUpdated | cardMoved | cardAssigned | cardDone | cardDeleted | cardRestored | cardPurged | cardDue
 * cardDeleted  = Karte in den Papierkorb verschoben (wiederherstellbar; beim Aufräumen detail.auto:true, detail.reason:'cleanup')
 * cardRestored = Karte aus dem Papierkorb zurückgeholt
 * cardPurged   = Karte endgültig entfernt (nach 30 Tagen im Papierkorb oder manuell)
 * Jedes Event hat die Form:
 *   { event, ts, board: {id, title}, card: {...}, detail: {...} }
 * Zusätzlich zum typspezifischen Event wird immer 'event' emittiert (für den Dispatcher).
 */
class EventBus extends EventEmitter {
    emitEvent(type, data) {
        const event = Object.assign({ event: type, ts: new Date().toISOString() }, data);
        this.emit(type, event);
        this.emit('event', event);
        return event;
    }
}

module.exports = { EventBus };
