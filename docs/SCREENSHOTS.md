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
| "settings-boards.png" | Board-Manager, Tab "Board", ganz oben | Zahnrad |
| "settings.png" | derselbe Reiter, ein Stueck weiter unten | Zahnrad |
| "settings-labels.png" | derselbe Reiter, ganz unten | Zahnrad |
| "settings-users.png" | Board-Manager, Tab "Benutzer" (Avatare und Farben) | Zahnrad, Tab "Benutzer" |
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
| "board.png" | 1868 x 890 | so gross wie das Fenster |
| "card-editor.png" | 1403 x 1050 | 1122 x 1002 |
| "settings*.png" | 1403 x 1000 | 1122 x 952 |
| "share.png" | 1403 x 1000 | 1122 x 661 |
| "mobile*.png" | 360 x 780, Faktor 2 | 720 x 1560 |

Die Fensterhoehe fuers Board richtet sich nach dem Inhalt: So hoch, dass die
laengste Spalte gerade noch ganz hineinpasst und darunter nicht mehr als ein
Rand Leerraum steht. Weil beide Sprachen dieselben Karten tragen, ist sie in
beiden gleich.

Die drei "settings"-Bilder zeigen denselben Reiter in drei Scrollpositionen,
nicht drei verschiedene Bereiche: Der Reiter ist laenger als das Fenster, und
die Ausschnitte ueberlappen sich.

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

**Beide Sprachen zeigen dasselbe Board.** Das englische Team-Board ist eine
Uebersetzung des deutschen: dieselben fuenfzehn Karten, dieselben Spalten,
Labels und Faelligkeiten, dieselbe Akzentfarbe. Vorher war es eine eigene,
duenner besetzte Welt in Tuerkis, und die englische Fassung illustrierte
dadurch systematisch weniger - kein Ort, keine Wiederholung, kein Link, leere
Abschnittszeilen im Karteneditor und keine Erledigt-Zeitstempel. Wer die
Demo-Daten einer Sprache aendert, zieht die andere mit.

**Die erledigten Karten brauchen einen Erledigt-Zeitpunkt.** Der entsteht nur
beim Verschieben in eine Erledigt-Spalte, nicht beim Anlegen. Ueber die
Schnittstelle also erst in einer offenen Spalte anlegen und danach per
"POST .../move" umhaengen, sonst fehlt auf der Karte die Zeile
"(Erledigt: ...)", die das Handbuch mit Beispiel nennt.

**Im Ansichten-Dialog steht die echte Adresse.** Das Feld "Generierte URL"
zeigt Rechner und Port der Aufnahmeumgebung. Fuer das Bild werden beide gegen
die Beispieladresse aus dem Handbuch getauscht, "192.168.1.10:8095"; der Rest
der erzeugten Adresse bleibt unangetastet.

**Auf dem Telefon ist die erste Spalte zugeklappt.** Sonst fuellt sie den
Schirm allein, und die Bildunterschrift verspricht gestapelte Spalten, von
denen keine zweite zu sehen ist. Geklappt wird ueber
"kanban.collapsedCols" im localStorage.
