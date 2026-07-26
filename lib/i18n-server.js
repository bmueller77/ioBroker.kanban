'use strict';

// Serverseitige Übersetzungen: Default-Spaltennamen (bei Board-Erstellung) und
// E-Mail-Texte. Klein gehalten; Englisch ist Fallback für fehlende Sprachen.

const STRINGS = {
    en: {
        'col.todo': 'To do', 'col.doing': 'In progress', 'col.done': 'Done',
        'ev.cardCreated': 'New card', 'ev.cardUpdated': 'Card changed', 'ev.cardMoved': 'Card moved',
        'ev.cardAssigned': 'Card assigned', 'ev.cardDone': 'Card done', 'ev.cardDeleted': 'Card deleted',
        'ev.cardDue': 'Card due', 'ev.cardRestored': 'Card restored', 'ev.cardPurged': 'Card permanently deleted',
        'col.trash': 'Trash',
        'mail.board': 'Board', 'mail.moved': 'Moved', 'mail.due': 'Due', 'mail.assignees': 'Assignees',
        'mail.by': 'By', 'mail.description': 'Description', 'mail.openCard': 'Open card in board',
        'mail.subjectPrefix': '[Kanban]',
        'mail.cleanupSubject': 'Cards moved to trash', 'mail.cleanupIntro': 'The following cards were moved to the trash:',
        'mail.purgedIntro': 'The following cards were permanently deleted:',
    },
    de: {
        'col.todo': 'Zu erledigen', 'col.doing': 'In Arbeit', 'col.done': 'Erledigt',
        'ev.cardCreated': 'Neue Karte', 'ev.cardUpdated': 'Karte geändert', 'ev.cardMoved': 'Karte verschoben',
        'ev.cardAssigned': 'Karte zugewiesen', 'ev.cardDone': 'Karte erledigt', 'ev.cardDeleted': 'Karte gelöscht',
        'ev.cardDue': 'Karte fällig', 'ev.cardRestored': 'Karte wiederhergestellt', 'ev.cardPurged': 'Karte endgültig gelöscht',
        'col.trash': 'Papierkorb',
        'mail.board': 'Board', 'mail.moved': 'Verschoben', 'mail.due': 'Fällig', 'mail.assignees': 'Zuständig',
        'mail.by': 'Durch', 'mail.description': 'Beschreibung', 'mail.openCard': 'Karte im Board öffnen',
        'mail.subjectPrefix': '[Kanban]',
        'mail.cleanupSubject': 'Karten in den Papierkorb verschoben', 'mail.cleanupIntro': 'Folgende Karten wurden in den Papierkorb verschoben:',
        'mail.purgedIntro': 'Folgende Karten wurden endgültig gelöscht:',
    },
    fr: {
        'col.todo': 'À faire', 'col.doing': 'En cours', 'col.done': 'Terminé',
        'ev.cardCreated': 'Nouvelle carte', 'ev.cardUpdated': 'Carte modifiée', 'ev.cardMoved': 'Carte déplacée',
        'ev.cardAssigned': 'Carte assignée', 'ev.cardDone': 'Carte terminée', 'ev.cardDeleted': 'Carte supprimée',
        'ev.cardDue': 'Carte à échéance', 'ev.cardRestored': 'Carte restaurée', 'ev.cardPurged': 'Carte supprimée définitivement',
        'col.trash': 'Corbeille',
        'mail.board': 'Tableau', 'mail.moved': 'Déplacée', 'mail.due': 'Échéance', 'mail.assignees': 'Assignés',
        'mail.by': 'Par', 'mail.description': 'Description', 'mail.openCard': 'Ouvrir la carte dans le tableau',
        'mail.subjectPrefix': '[Kanban]',
        'mail.cleanupSubject': 'Cartes déplacées vers la corbeille', 'mail.cleanupIntro': 'Les cartes suivantes ont été déplacées vers la corbeille :',
        'mail.purgedIntro': 'Les cartes suivantes ont été supprimées définitivement :',
    },
    nl: {
        'col.todo': 'Te doen', 'col.doing': 'Bezig', 'col.done': 'Voltooid',
        'ev.cardCreated': 'Nieuwe kaart', 'ev.cardUpdated': 'Kaart gewijzigd', 'ev.cardMoved': 'Kaart verplaatst',
        'ev.cardAssigned': 'Kaart toegewezen', 'ev.cardDone': 'Kaart voltooid', 'ev.cardDeleted': 'Kaart verwijderd',
        'ev.cardDue': 'Kaart vervalt', 'ev.cardRestored': 'Kaart hersteld', 'ev.cardPurged': 'Kaart definitief verwijderd',
        'col.trash': 'Prullenbak',
        'mail.board': 'Bord', 'mail.moved': 'Verplaatst', 'mail.due': 'Vervaldatum', 'mail.assignees': 'Toegewezen aan',
        'mail.by': 'Door', 'mail.description': 'Beschrijving', 'mail.openCard': 'Kaart in bord openen',
        'mail.subjectPrefix': '[Kanban]',
        'mail.cleanupSubject': 'Kaarten naar prullenbak verplaatst', 'mail.cleanupIntro': 'De volgende kaarten zijn naar de prullenbak verplaatst:',
        'mail.purgedIntro': 'De volgende kaarten zijn definitief verwijderd:',
    },
    it: {
        'col.todo': 'Da fare', 'col.doing': 'In corso', 'col.done': 'Completato',
        'ev.cardCreated': 'Nuova scheda', 'ev.cardUpdated': 'Scheda modificata', 'ev.cardMoved': 'Scheda spostata',
        'ev.cardAssigned': 'Scheda assegnata', 'ev.cardDone': 'Scheda completata', 'ev.cardDeleted': 'Scheda eliminata',
        'ev.cardDue': 'Scheda in scadenza', 'ev.cardRestored': 'Scheda ripristinata', 'ev.cardPurged': 'Scheda eliminata definitivamente',
        'col.trash': 'Cestino',
        'mail.board': 'Bacheca', 'mail.moved': 'Spostata', 'mail.due': 'Scadenza', 'mail.assignees': 'Assegnatari',
        'mail.by': 'Da', 'mail.description': 'Descrizione', 'mail.openCard': 'Apri la scheda nella bacheca',
        'mail.subjectPrefix': '[Kanban]',
        'mail.cleanupSubject': 'Schede spostate nel cestino', 'mail.cleanupIntro': 'Le seguenti schede sono state spostate nel cestino:',
        'mail.purgedIntro': 'Le seguenti schede sono state eliminate definitivamente:',
    },
};

function serverT(lang, key) {
    const l = String(lang || 'en').toLowerCase();
    const dict = STRINGS[l] || STRINGS.en;
    return dict[key] != null ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
}

module.exports = { serverT, SERVER_LANGS: Object.keys(STRINGS) };
