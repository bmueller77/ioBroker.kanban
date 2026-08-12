# Screenshots für die Doku

Sprache je Ordner: deutsche Screenshots nach `docs/de/img/`, englische nach `docs/en/img/`.
Aufnahme über die laufende Instanz; für Englisch die Instanz-Sprache auf `en` stellen (bzw. `&lang=en` anhängen). Für die Admin-Screenshots die Sprache der **admin.0-Instanz** umstellen (Instanzen → admin.0 → „Sprache" — sie übersteuert die Systemsprache).

| Datei | Ansicht | Quelle |
|---|---|---|
| `board.png` | Board-Übersicht | Board im Browser |
| `card-editor.png` | Karten-Dialog | Stift-Symbol neben dem Kartentitel anklicken |
| `settings.png` | Board-Manager, Tab *Board* (Spalten mit Max/WIP/Neu/Erledigt) | ⚙ |
| `settings-labels.png` | Board-Manager: Labels + Link-Ziel | ⚙ → Tab *Board*, unten |
| `settings-users.png` | Board-Manager, Tab *Benutzer* (Avatare + Farben) | ⚙ → Tab *Benutzer* |
| `settings-boards.png` | Board-Manager: Board-Auswahl, Titel, Mitglieder | ⚙ → Tab *Board*, oben |
| `share.png` | „Ansichten"-Dialog | Monitor-Symbol in der Kopfleiste |
| `admin-general.png` | Instanzeinstellungen, Tab *Allgemein* | ioBroker-Admin |
| `admin-users.png` | Instanzeinstellungen, Tab *Benutzer* | ioBroker-Admin |
| `admin-email.png` | Instanzeinstellungen, Tab *Benachrichtigungen* | ioBroker-Admin |
| `mobile.png` | Mobile Ansicht (gestapelte Spalten) | Smartphone (360×780, Faktor 2) |
| `mobile-drag.png` | Mobile Ansicht – Schnellmenü beim Ziehen einer Karte | Smartphone (360×780, Faktor 2) |

Empfohlen: Fensterbreite ~1200–1450 px (Board), heller **oder** dunkler Modus konsistent.

## Maße

Die Dialogbilder zeigen **nur den Dialog**, ohne das Board dahinter. Der Dialog ist
60 vw breit: bei einem 1868 px breiten Fenster ergibt das die 1122 px, die alle
`settings-*.png`, `card-editor.png` und `share.png` haben. Das Board selbst wird bei
1868 px Breite aufgenommen, die Höhe richtet sich nach dem Inhalt (aktuell 876 px
deutsch, 720 px englisch).

Die Admin-Bilder sind auf die Konfigurationsfläche zugeschnitten (ohne ioBroker-Rahmen
und Seitenleiste) und 1504 px breit — die Benutzertabelle braucht seit 0.3.0 elf
Ereignis-Spalten, schmaler passt sie nicht mehr aufs Bild.
