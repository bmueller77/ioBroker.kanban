# Screenshots fuer die Doku

Sprache je Ordner: deutsche Screenshots nach "docs/de/img/", englische nach
"docs/en/img/". Aufnahme an der laufenden Instanz, deutsch auf 8096, englisch auf
8097; die Sprache kommt ueber "&lang=" an der URL. Fuer die Admin-Screenshots
laesst sie sich nicht anhaengen, dort muss die Sprache der **admin.0-Instanz**
umgestellt werden (Instanzen -> admin.0 -> "Sprache", sie uebersteuert die
Systemsprache).

| Datei | Ansicht | Quelle |
|---|---|---|
| "board.png" | Board-Uebersicht | Board im Browser |
| "card-editor.png" | Karten-Dialog, Checkliste aufgeklappt | Stift-Symbol neben dem Kartentitel anklicken |
| "settings.png" | Board-Manager, Tab "Board" (Spalten mit Max/WIP/Neu/Erledigt) | Zahnrad |
| "settings-labels.png" | Board-Manager: Labels, Link-Ziel und Aufraeumen | Zahnrad, Tab "Board", unten |
| "settings-users.png" | Board-Manager, Tab "Benutzer" (Avatare und Farben) | Zahnrad, Tab "Benutzer" |
| "settings-boards.png" | Board-Manager: Board-Auswahl, Titel, Mitglieder | Zahnrad, Tab "Board", oben |
| "share.png" | Dialog "Ansichten" | Monitor-Symbol in der Kopfleiste |
| "admin-general.png" | Instanzeinstellungen, Tab "Allgemein" | ioBroker-Admin |
| "admin-users.png" | Instanzeinstellungen, Tab "Benutzer" | ioBroker-Admin |
| "admin-email.png" | Instanzeinstellungen, Tab "Benachrichtigungen" | ioBroker-Admin |
| "mobile.png" | Mobile Ansicht (gestapelte Spalten) | Smartphone (360x780, Faktor 2) |
| "mobile-drag.png" | Mobile Ansicht, Schnellmenue beim Ziehen einer Karte | Smartphone (360x780, Faktor 2) |

Alle Bilder im **dunklen Modus**, an der URL mit "&theme=dark" erzwungen.

## Masse

Die Dialogbilder zeigen nur den Dialog, ohne das Board dahinter. Karten-Dialog,
Board-Manager und Ansichten sind seit 0.3.2 **80 vw** breit; fuer die
ueberlieferten 1122 px braucht es also ein **1403 px** breites Fenster. Die Hoehe
von Karten-Dialog und Board-Manager haengt am Fenster ("100vh - 48px"), die des
Ansichten-Dialogs am Inhalt.

| Bild | Fenster | Ergebnis |
|---|---|---|
| "board.png" | 1868 x 890 (de), 1868 x 512 (en) | so gross wie das Fenster |
| "card-editor.png" | 1403 x 1050 | 1122 x 1002 |
| "settings*.png" | 1403 x 1000 | 1122 x 952 |
| "share.png" | 1403 x 1000 | 1122 x 661 |
| "mobile*.png" | 360 x 780, Faktor 2 | 720 x 1560 |

Die Fensterhoehe fuers Board richtet sich nach dem Inhalt: So hoch, dass die
laengste Spalte gerade noch ganz hineinpasst und darunter nicht mehr als ein
Rand Leerraum steht. Deshalb sind die beiden Sprachen hier verschieden hoch.

Die Admin-Bilder sind auf die Konfigurationsflaeche zugeschnitten, ohne
ioBroker-Rahmen und Seitenleiste, und 1504 px breit. Schmaler geht nicht mehr:
Die Benutzertabelle hat neun Ereignis-Spalten, dazu ID, Anzeigename, E-Mail und
die Sortierpfeile - schmaler laufen sie rechts aus dem Bild.

## Was leicht schiefgeht

**Die Browsersprache faerbt die nativen Felder.** Faelligkeitsdatum und Uhrzeit
sind "input type=date" beziehungsweise "time"; ihr Format kommt vom Browser, nicht
vom Adapter. Wird der Browser deutsch gestartet, steht im englischen Handbuch
"04.09.2026" statt "09/04/2026". Chrome mit "--lang=en-US --accept-lang=en-US"
starten.

**Die Demo-Daten veralten.** Faelligkeiten sind absolute Daten. Ein paar Wochen
nach der Aufnahme ist auf dem Bild alles rot, und die Farben fuer heute, morgen
und spaeter kommen nirgends mehr vor. Vor einer neuen Runde die Termine der
Testboards auf den Aufnahmetag ausrichten: mindestens eine Karte ueberfaellig,
eine heute, eine morgen, eine spaeter und eine ohne Datum.

**Die Zahlen im Spaltenkopf stehen im localStorage.** Ohne Zutun zeigt jede
Spalte nur ihre Gesamtzahl. Fuer "board.png" wird "kanban.countModes" vorher
gesetzt, damit die erste Spalte auch die drei Faelligkeitszahlen zeigt.
