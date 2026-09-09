'use strict';

/**
 * Entscheidung, was beim Einfrieren der Benutzer-IDs zu tun ist.
 *
 * Die eigentliche Arbeit steckt im Adapter, hier steht nur die Entscheidung -
 * sie ist der Teil, an dem der Fehler aus dem Abnahmetest (Befund 22) hing und
 * der sich ohne laufenden ioBroker pruefen laesst.
 *
 * Hintergrund: Der Adapter schreibt beim Start das Merkmal `fixed` in die
 * Benutzerliste der Instanz und startet dadurch einmal neu. Hat jemand die
 * Instanzeinstellungen dabei offen, haelt sein Formular noch den Stand von
 * vorher, und sein naechstes Speichern loescht das Merkmal wieder. Genau das
 * ist der Normalfall beim Einrichten einer frischen Instanz.
 *
 * Deshalb mehrere Versuche statt eines einzigen. Eine wirklich kaputte
 * Einstellungstabelle kostet dann `max` Neustarts, ein einmaliger Wettlauf
 * heilt sich beim naechsten Start von selbst.
 *
 * Eingefroren wird nur, woran etwas haengt. Der Grund fuers Einfrieren sind
 * Karten und Avatarbilder, die auf die Kennung zeigen; solange es keine gibt,
 * ist eine Umbenennung harmlos. Das spart einer frisch eingerichteten Instanz
 * den Rueckschreibvorgang und damit den Neustart, in dessen Fenster das
 * Speichern im Admin verlorenging (A15).
 *
 * @param users Benutzerliste aus der Instanzkonfiguration
 * @param versuche bisherige Versuche, das Merkmal zurueckzuschreiben
 * @param max Hoechstzahl der Versuche
 * @param benutzt Kennungen, an denen etwas haengt. Fehlt der Wert, gilt wie
 *        frueher jede Kennung als schuetzenswert.
 * @returns `{ tun, offen, zuruecksetzen }` mit tun = 'nichts' | 'schreiben' | 'aufgeben'
 */
function freezePlan(users, versuche, max, benutzt) {
    const liste = Array.isArray(users) ? users : [];
    const zaehlt = benutzt instanceof Set ? n => benutzt.has(n) : () => true;
    const offen = liste.filter(u => u && u.name && !u.fixed && zaehlt(u.name)).map(u => u.name);
    if (!offen.length) {
        // Nichts offen heisst: Der letzte Schreibversuch hat gehalten. Der
        // Zaehler darf wieder bei null anfangen, damit ein spaeterer Verlust
        // erneut volle Versuche bekommt.
        return { tun: 'nichts', offen, zuruecksetzen: Number(versuche) > 0 };
    }
    if (Number(versuche) >= Number(max)) {
        return { tun: 'aufgeben', offen, zuruecksetzen: false };
    }
    return { tun: 'schreiben', offen, zuruecksetzen: false };
}

/**
 * Welche festgeschriebenen Kennungen noch gebraucht werden.
 *
 * Die Liste wuchs bisher nur. Wer einen Benutzer loeschte und spaeter einen
 * neuen mit derselben Kennung anlegte, haette dessen ID-Feld von Anfang an
 * gesperrt vorgefunden, obwohl an der Kennung nichts mehr haengt (B16).
 *
 * @param bekannt bisher festgeschriebene Kennungen
 * @param users Benutzerliste aus der Instanzkonfiguration
 * @returns `{ bleibt, faellt }`, beide in der Reihenfolge von `bekannt`
 */
function prunePlan(bekannt, users) {
    const liste = Array.isArray(bekannt) ? bekannt.filter(n => typeof n === 'string' && n) : [];
    const vorhanden = new Set((Array.isArray(users) ? users : []).map(u => u && u.name).filter(Boolean));
    return {
        bleibt: liste.filter(n => vorhanden.has(n)),
        faellt: liste.filter(n => !vorhanden.has(n)),
    };
}

module.exports = { freezePlan, prunePlan };
