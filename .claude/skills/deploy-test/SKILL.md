---
name: deploy-test
description: Adapter-Stand aus dem GitHub-Branch auf dem ioBroker installieren und dort verifizieren. Nutzen, wenn eine Änderung am iobroker.kanban live geprüft werden soll — „auf dem ioBroker testen", „installieren", „live prüfen".
allowed-tools: [Bash, Read, Grep, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__find, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__tabs_context_mcp]
---

# Adapter auf dem ioBroker installieren und prüfen

Änderungen werden **nicht** aus dem lokalen Ordner deployt, sondern über die
GitHub-Installation des Admin. Der Adapter muss also erst gepusht sein.

## Umgebung

| Was | Wo |
|---|---|
| ioBroker-Admin | `http://172.30.0.40:8081` |
| Web-Terminal | `http://172.30.0.40:8089` |
| `kanban.0` (8095) | **produktiv** — mit updaten, aber keine Karten/Einstellungen ändern |
| `kanban.1` (8096), `kanban.2` (8097) | Test-Instanzen, dort ist alles erlaubt |

## Browser

**Nur das echte Chrome** (`mcp__claude-in-chrome__*`) funktioniert. Der eingebaute
Browser liefert für `172.30.0.40` „This site requires per-action approval;
Browser read tools are not available on it" — dort bin ich blind, Screenshots und
Auslesen sind gesperrt. Nicht damit anfangen, das kostet nur Zeit.

Im Admin **nie auf feste Koordinaten klicken**: Layout verschiebt sich. Immer
`find` → `ref_N` → `computer{action:"left_click", ref:"ref_N"}`.

`find` sucht über den Accessibility-Baum, nicht über das Aussehen. Suchbegriffe,
die funktionieren:

| Gesucht | Anfrage, die trifft |
|---|---|
| Octocat-Symbol in der Adapter-Leiste | `button to install adapter from custom URL` (heißt dort „Installieren aus eigener URL") |
| Speichern-Knopf unten | `SPEICHERN button in the bottom action bar` — im Baum steht **„Save"**, nicht „Speichern" |
| Feld in einer Tabellenzeile | über den **Inhalt**: `textbox containing the value team-board` |

`computer{action:"wait"}` nimmt höchstens **10** Sekunden je Aufruf.

## Ablauf

### 1. Pushen
Die Installation zieht den Branch von GitHub, lokale Commits allein reichen nicht.

```bash
git -C E:/Development/iobroker.kanban/repo push origin feature/0.3.0
```

### 2. Expertenmodus einschalten
Im Admin oben in der Symbolleiste das **Schraubenschlüssel-Symbol**. Es erscheint
ein Hinweisdialog („Der Expertenmodus ist momentan nur für diese Browsersitzung
aktiviert"), darin OK.

Erkennungsmerkmal, dass er an ist: Das **Männchen-Symbol in der Leiste ist grün**
und rechts daneben steht der Hostname `SMARTHOMESERVER`.

Gilt nur für die Browsersitzung — in einer frischen Sitzung erneut setzen.

### 3. Installation aus GitHub
Links **Adapter** → in der Symbolleiste über den Kacheln das **GitHub-Symbol
(Octocat)** → Dialog mit vier Reitern.

Reiter **BENUTZERDEFINIERT** wählen (nicht „VON GITHUB", das listet nur die
offiziellen Adapter). URL-Muster:

```
https://github.com/bmueller77/iobroker.kanban/tarball/<branch>
```

also z. B. `.../tarball/feature/0.3.0`. Dann **INSTALLIEREN**.

Dahinter läuft `iobroker url <tarball-url> --host SmartHomeServer --debug`.

**Wichtig:** Im Konsolenfenster „Befehl ausführen" das Häkchen **„Schließen wenn
fertig" ausschalten**, sonst verschwindet das Fenster und die Ausgabe ist weg.
Der Umschalter „Weniger Protokolle / Detailliert" steuert die Ausgabetiefe.
`SCHLIESSEN` ist während des Laufs ausgegraut und wird am Ende aktiv.

Der Lauf dauert rund 20 Sekunden. Am Ende steht im Fenster:

```
Updating objects from io-package.json for adapter "kanban" with version "0.3.0"
Update "system.adapter.kanban.1"
Process exited with code 0
```

Die Versionszeile ist die nützlichste: Sie zeigt, welcher Stand wirklich
angekommen ist. `Process exited with code 0` allein reicht nicht — in
wiederverwendeten Fenstern kann die Zeile vom vorherigen Lauf stammen.

### 3b. Instanzen neu starten — nicht darauf verlassen, dass es von selbst passiert

**Der Install ersetzt nur die Dateien.** Ob die laufenden Instanzen den neuen Code
übernehmen, hängt daran, ob sich die Versionsnummer geändert hat: Bei gleicher
Nummer (etwa zwei Läufe hintereinander mit `0.3.0`) laufen sie unverändert weiter,
und die Prüfung misst dann den **alten** Stand. Genau das führt zu dem Fehlschluss
„der Fix wirkt nicht".

Deshalb nach jedem Install: *Instanzen* → oben nach `kanban` filtern → in jeder
betroffenen Zeile der **Neu-starten-Knopf** (Kreispfeil, dritte Schaltfläche).
`find` findet ihn über `restart button in the kanban.1 instance row`.

`kanban.0` gehört mit neu gestartet, damit produktiv und Test denselben Code
fahren. Danach rund 15 Sekunden warten, bevor die erste Prüfung läuft.

### 4. Erfolg prüfen — niemals am Dialog

Das Verschwinden des Fensters heißt nur „durchgelaufen", nicht „fehlerfrei".
Immer am laufenden Adapter messen. Beispiele:

```bash
# Läuft der neue Code? (hier: CORS-Fix — alter Code sendete den Header immer)
curl -s -D - -o /dev/null -H "Origin: https://fremd.example" http://172.30.0.40:8096/ | grep -i access-control

# Version, die der Admin anzeigt: Instanzeinstellungen-Kopfzeile, z. B. "v0.3.0"
# Neue jsonConfig-Felder: Instanzeinstellungen öffnen und Tab prüfen
```

Instanzeinstellungen direkt ansteuern:
`http://172.30.0.40:8081/#tab-instances/config/system.adapter.kanban.1`

### 5. Funktional testen über die API

Boards der Testinstanz lesen (GET braucht keinen Token):

```bash
curl -s http://172.30.0.40:8096/api/boards
```

Für einen **unbegrenzten** Schreib-Token reicht die ausgelieferte Seite — das
SPA-Secret steht als `<meta>` darin und ist im LAN bewusst offen (dokumentierte
Grenze des Schutzes):

```bash
SPA=$(curl -s http://172.30.0.40:8096/ | grep -o 'kanban-token" content="[^"]*"' | sed 's/.*content="//;s/"//')
curl -s -X POST http://172.30.0.40:8096/api/boards -H "X-Kanban-Token: $SPA" \
  -H 'Content-Type: application/json' -d '{"id":"pruefung","title":"Pruefung"}'
```

Damit lässt sich ein Wegwerf-Board anlegen, darauf testen und es hinterher per
`DELETE /api/boards/pruefung` wieder entfernen — ohne die echten Boards
anzufassen.

Für Tests der **Board-Begrenzung** dagegen einen eigenen Token: Instanzeinstellungen
→ Tab **Webhooks (eingehend)** → **„Neuen Token generieren"** (fragt sofort
„Konfiguration speichern?"), danach **Erlaubte Boards** eintragen und unten
**SPEICHERN**.

```bash
T=<token>; H=http://172.30.0.40:8096
curl -s -w "\n%{http_code}\n" -X POST "$H/webhook/$T/action" \
  -H 'Content-Type: application/json' -d '{"cmd":"listBoards"}'
```

Angelegte Testkarten hinterher wieder entfernen (`deleteCard`, dann `purgeCard`).

## Fallen

- **Web-Terminal verschluckt Anführungszeichen und Backslashes.** `grep -E "a|b"`
  wird zur Shell-Pipe, `tr '\n' ' '` zu `tr n ' '`. Mehrere `-e` statt
  Alternation, keine Backslashes, JSON-Bodies lieber über den Browser schicken.
- **Wiederverwendete Dialogfenster** zeigen die Ausgabe des *vorherigen* Laufs.
  Ein „Process exited with code 0" kann von der letzten Aktion stammen.
- **jsonConfig ist wählerisch:** `sendTo` mit `useNative` übernimmt nur eine
  Antwort mit einem Feld `native`; `staticLink` beschriftet sich über `label`,
  nicht über `text`.
