# iobroker.kanban

Kanban board adapter for ioBroker with its **own web server**, live sync, webhooks, multi-user support and e-mail notifications (including calendar invites) via the `email` adapter.

![Kanban board](docs/en/img/board.png)

📖 **Full documentation:** [English](docs/en/README.md) · [Deutsch](docs/de/README.md)

## Installation

> This adapter is **not** (yet) in the official ioBroker repository — install it directly from GitHub.

**Via the admin UI:** *Adapters* tab → **GitHub/Octocat icon** ("install from custom URL") → *custom / ANY* tab → enter this URL and install:

```
https://github.com/bmueller77/iobroker.kanban
```

**Via the command line** (on the ioBroker host):

```bash
iobroker url https://github.com/bmueller77/iobroker.kanban
```

Then create an instance `kanban.0` and open the web UI: `http://<host>:8095/`

> ⚠️ Adapters installed from GitHub receive **no automatic updates** and run "at your own risk". To update, simply install again as above.

## Features

- **Own web server** (default port 8095) — the web UI is served directly by the adapter; no `iobroker upload` needed for UI updates
- **Multiple boards** with freely configurable columns (name, order, display limit, WIP limit, "new"/"done" flags)
- **Cards** with title, Markdown description, assignees, due date (optionally with time), labels, color, priority, checklist, link, location and calendar invite
- **Recurring tasks** (daily/weekly/monthly/yearly, n-th weekday, n-th working day incl. public-holiday calculation)
- **Drag & drop** (mouse + touch), live sync across all open views via WebSocket (polling fallback)
- **Multi-user without login**: user registry in the admin config, assignable members per board; the header chips act as a saved per-board person filter
- **E-mail notifications** via `iobroker.email` on assignment, due date and card events (toggleable per event type and per user)
- **Webhooks inbound** (token-secured) and **outbound** (JSON POST on events)
- **Share view**: dialog to build filtered, embeddable links
- **iframe-friendly** (no frame headers) with `?embed=1` mode for Lovelace & co.
- **Multilingual** (de, en, fr, nl, it), configurable **date & time format** per instance (moment/Day.js tokens with localised month/weekday names, 12h/24h), theming (light/dark/auto, accent color, custom CSS)

## Web UI / URL parameters

`http://<host>:8095/` with optional parameters (excerpt — full list in the [docs](docs/en/README.md#sharing-views--url-parameters)):

| Parameter | Effect |
|---|---|
| `board=<id>` | preselect a board |
| `users=<name,name>` | person filter: show only cards assigned to these users (`user=<name>` = single-user short form) |
| `label=<id,id>` | label **blacklist**: hide cards with these labels |
| `columns=<id,id>` | show only these columns |
| `doneLimit=N` | in done columns show only N cards (`0` = none, omit = all) |
| `theme=light\|dark\|auto` | force a theme |
| `embed=1` | borderless view without the header bar (for iframes) |
| `card=<id>` | open a card dialog directly (deep link from e-mails) |
| `lang=de\|en\|fr\|nl\|it` | force a language |

### Lovelace embedding

```yaml
type: iframe
url: http://<host>:8095/?board=family&embed=1&theme=auto&user=user1
aspect_ratio: 75%
```

## REST API

For integrations on the local network (the same API the web UI uses). **Reading** (`GET`) is open; **writing** (`POST`/`PATCH`/`DELETE`) requires a token from 0.1.1 (`X-Kanban-Token`; the web UI sends it automatically) — see [Security](docs/en/README.md#security--access-control).

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/boards` | board list |
| POST | `/api/boards` | create a board `{title}` |
| GET | `/api/boards/:id` | board JSON; with `?rev=<n>` → `{unchanged:true}` if current |
| PATCH | `/api/boards/:id` | `{title?, columns?, labels?}` |
| DELETE | `/api/boards/:id` | delete a board |
| POST | `/api/boards/:id/cards` | create a card |
| PATCH | `/api/boards/:id/cards/:cardId` | update a card partially |
| POST | `/api/boards/:id/cards/:cardId/move` | `{columnId, order?}` |
| DELETE | `/api/boards/:id/cards/:cardId` | delete a card |
| PATCH | `/api/users/:name` | set a user colour (applied at runtime, no restart) |

## Webhooks & commands

External systems (scripts, agents) modify boards/cards token-secured via `POST /webhook/<token>/action`. The same command vocabulary applies as for `sendTo` and the `action` state:

```bash
curl -X POST http://<host>:8095/webhook/<token>/action \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"addCard","board":"family","title":"Buy milk","assignees":["user1"],"due":"2026-07-15"}'
```

Commands: `listBoards`, `getBoard`, `addBoard`, `deleteBoard`, `addCard`, `updateCard`, `moveCard`, `doneCard`, `deleteCard`. From ioBroker scripts:

```js
sendTo('kanban.0', 'addCard', { board: 'family', title: 'From a script' }, res => log(JSON.stringify(res)));
setState('kanban.0.action', JSON.stringify({ cmd: 'doneCard', board: 'family', cardId: 'c_xyz' }));
```

**Outbound webhooks** send a JSON POST to configured URLs on events (`cardCreated, cardUpdated, cardMoved, cardAssigned, cardDone, cardDeleted, cardDue`). Details in the [docs](docs/en/README.md#webhooks--inbound).

## States (for scripts/visualization)

| State | Content |
|---|---|
| `kanban.0.boards.<id>.data` | full board as JSON (read-only) |
| `kanban.0.boards.<id>.rev` / `.cardCount` / `.overdueCount` | revision & counters |
| `kanban.0.users.<name>.assignedCount` / `.overdueCount` / `.overdueList` | per user |
| `kanban.0.lastEvent` | last event as JSON (can trigger scripts) |
| `kanban.0.action` | command input (write JSON, cleared after processing) |

## Security

From **0.1.1**: token-secured write API, Markdown preview sanitized with DOMPurify (no stored XSS), a Content Security Policy and safe link schemes only. The web UI works without a login — the token blocks third-party websites/CSRF but is **not** a substitute for network isolation. For hard isolation, bind the port to the LAN only or put an authenticating reverse proxy in front. Details: [Security & access control](docs/en/README.md#security--access-control).

## Requirements

- js-controller ≥ 6.0.11, Node.js ≥ 20
- For e-mail notifications: a configured `iobroker.email` instance
- Optional: `iobroker.feiertage` for region-accurate public-holiday calculation of the working-day recurrences

## Changelog

- **0.3.0**
  - **Trash**: deleting a card no longer removes it immediately — it moves to a per-board **Trash** column and can be restored for **30 days**, after which it is deleted permanently. The trash column is hidden by default and can be shown per device (board settings). It has its own fixed grey styling, is sorted by deletion time and shows the remaining days per card
  - Optional **automatic cleanup** of old done cards per board — by **age** (default 90 days) or by **count** (default 100) — moving them into the trash daily and on adapter start
  - **Per-column sorting**: a toggle in the column header opens a menu with six modes — drag & drop, drag handles, due date (incl. time, cards without a date last), priority, newest first and oldest first (by the time the card entered the column, e.g. most recently completed on top). The mode is stored per device; returning to the manual modes restores your own order
  - Done cards now show a **strikethrough title**, a **completion timestamp** in the configured date/time format, and a **copy button** that opens the editor with the same content
  - Cards can be **moved or copied to another board**: labels are matched by name, assignees are limited to members of the target board, and if none remain you are asked to pick one
  - New events **cardRestored** and **cardPurged**; `cardDeleted` now means "moved to trash" (automatic cleanup adds `detail.auto`). Per-user e-mail toggles for all three; automatic cleanup runs are bundled into one summary e-mail per user
  - Every notification event now carries **dueAt** — the due date including time as an ISO timestamp with local offset (no time = 00:00)
  - Reworked **board settings**: one Board tab with a board picker (edit any board without switching), a "show this board" button, create/delete board, member selection and the cleanup section
  - Reworked **card editor layout**: calendar-invite checkbox and location moved up below the due date; assignees and labels sit side by side (stacked on narrow screens)
  - All irreversible actions now use an **in-app confirmation dialog** instead of the browser's `confirm()`

- **0.2.1**
  - Now runs on **Express 5** (updated dependency)
  - Fixed the **user avatar upload** ("image could not be read"): the Content-Security-Policy blocked the `blob:` URL used to read the file; the image is now loaded without a `blob:` URL, so the CSP stays strict
  - Requires **Node.js 20+** (Node.js 18 reached end-of-life) and **admin 7.8.23+**
  - Updated dependencies (`@iobroker/adapter-core`, `ws`)
  - Adapter metadata (type, connection type, keywords) and repository housekeeping for the ioBroker repository (adapter checker)
  - Every notification event now carries a ready-to-use deep **link** to the card; the docs gained copy-paste **Telegram/Pushover** notification-routing examples

- **0.2.0**
  - Mobile: columns stack & collapse (accordion); full-screen dialogs with a fixed action bar (equal-width buttons), no sideways scrolling
  - Assignable **users per board** — managed centrally under *Settings → Boards*; each board needs at least one member
  - Header user chips are now a **saved, per-board filter** (multi-select; tap to show only those users' cards; all active by default). The old "my cards" button was removed
  - **User colours** are edited in the web UI (*Settings → Users*), applied instantly **without an adapter restart** (previously in the instance config)
  - **Colour ring** around avatars (cards always, chips when selected), 50% larger avatars, and **automatic black/white text** on labels & avatars (WCAG luminance) for readability
  - Per-board **notification link target**: board view (highlight card), card editor, or a fixed custom URL
  - **Configurable date format** per instance (moment/Day.js tokens incl. localised month/weekday names) plus a 12h/24h **time format**; empty date format = ioBroker system format
  - **At least one assignee is required** per card in the UI — required fields are marked with a red `*`; the validation message follows the board language
  - **Per-column display limit** ("Max"): show only the first N cards, the rest collapse into a `+X more` hint
  - Column settings gained an aligned header row (Title · Max · WIP · New · Done) with explanatory tooltips
  - Material Design icons throughout (toolbar, card badges, link types) — no more emoji glyphs
- **0.1.3** — Fix: the column task count now respects the active person/label filter (previously showed the column total)
- **0.1.2** — "Share view": `doneLimit` distinguishes empty=all / 0=none; label filter is now a blacklist (new labels stay visible)
- **0.1.1** — Security: token-protected write API, sanitized Markdown preview, CSP, safe link schemes
- **0.1.0** — Initial release

[Older changelogs can be found there](CHANGELOG_OLD.md)

## Acknowledgements

Built with the support of Anthropic's **Claude** — in particular for the translations of the web UI and this documentation (English, French, Dutch, Italian), as well as testing and documentation review.

## License

MIT © 2026 Björn Müller
