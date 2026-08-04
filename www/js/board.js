// Board-Rendering + SortableJS-Drag&Drop

import { t, currentLang } from './i18n.js';

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

// MDI-Icons (offizielle Pfaddaten) als Inline-SVG, faerbt sich per currentColor
const MDI_EYE = 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z';
const MDI_EYE_CLOSED = 'M12 17.5C8.2 17.5 4.8 15.4 3.2 12H1C2.7 16.4 7 19.5 12 19.5S21.3 16.4 23 12H20.8C19.2 15.4 15.8 17.5 12 17.5Z';
const MDI_NOTE = 'M15 3H5A2 2 0 0 0 3 5V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V9L15 3M19 19H5V5H14V10H19M17 14H7V12H17M14 17H7V15H14';
const MDI = {
    calendar: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
    check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
    sync: 'M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z',
    mapMarker: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
    email: 'M20,8L12,13L4,8V6L12,11L20,6M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z',
    phone: 'M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z',
    youtube: 'M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z',
    pdf: 'M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M9.5 11.5C9.5 12.3 8.8 13 8 13H7V15H5.5V9H8C8.8 9 9.5 9.7 9.5 10.5V11.5M14.5 13.5C14.5 14.3 13.8 15 13 15H10.5V9H13C13.8 9 14.5 9.7 14.5 10.5V13.5M18.5 10.5H17V11.5H18.5V13H17V15H15.5V9H18.5V10.5M12 10.5H13V13.5H12V10.5M7 10.5H8V11.5H7V10.5Z',
    image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
    navigation: 'M21 3L3 10.53V11.5L9.84 14.16L12.5 21H13.46L21 3Z',
    link: 'M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76V7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24V16.24L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L13.41,14.83C14.59,13.66 14.59,11.76 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z',
    web: 'M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
    chevronUp: 'M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z',
    chevronDown: 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
    chevronRight: 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z',
    plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
    // Sortiermodi (Feature 1)
    sortManual: 'M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z',
    sortGrid: 'M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z',
    // Faelligkeit = Kalender, Alter in Spalte = Uhr (Pfeile bleiben dem Richtungsumschalter vorbehalten)
    sortDue: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
    sortPrio: 'M14.4,6L14,4H5V21H7V14H12.6L13,16H20V6H14.4Z',
    sortAge: 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z',
    // Richtungsumschalter im Spaltenkopf
    dirDown: 'M19 7H22L18 3L14 7H17V21H19M2 17H12V19H2M6 5V7H2V5M2 11H9V13H2V11Z',
    dirUp: 'M19 17H22L18 21L14 17H17V3H19M2 17H12V19H2M6 5V7H2V5M2 11H9V13H2V11Z',
    // Papierkorb-Aktionen (Feature 5)
    restore: 'M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z',
    deleteForever: 'M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8.46,11.88L9.87,10.47L12,12.59L14.12,10.47L15.53,11.88L13.41,14L15.53,16.12L14.12,17.53L12,15.41L9.88,17.53L8.47,16.12L10.59,14L8.46,11.88M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z',
    broom: 'M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z',
    // Karten-Editor / Übertragen (Feature 3+6); contentCopy = mdi:file-restore-outline
    contentCopy: 'M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2M18 20H6V4H13L18 9V20M17 13.24C17 15.86 14.87 18 12.24 18C10.29 18 8.61 16.82 7.88 15.14H9.5C10.11 16 11.11 16.57 12.24 16.57C14.08 16.57 15.57 15.07 15.57 13.24S14.08 9.9 12.24 9.9C10.95 9.9 9.86 10.65 9.29 11.71L10.81 13.24H7V9.43L8.24 10.67C9.09 9.35 10.55 8.5 12.24 8.5C14.87 8.47 17 10.61 17 13.24Z',
    transfer: 'M8 4A2 2 0 0 0 6 6V10H8V6H16V9H13.5L17 12.5L20.5 9H18V6A2 2 0 0 0 16 4H8M3 12V14H11V12H3M3 15V17H11V15H3M13 15V17H21V15H13M3 18V20H11V18H3M13 18V20H21V18H13Z',
    arrowRightCircle: 'M22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12M6,13H14L10.5,16.5L11.92,17.92L17.84,12L11.92,6.08L10.5,7.5L14,11H6V13Z',
    // Editor oeffnen (mdi:invoice-text-edit-outline) - sitzt hinter dem Kartentitel
    invoiceTextEdit: 'M9.86 21.43L9 22L6 20L3 22V3H21V10.2C20.37 9.93 19.64 9.93 19 10.22V5H5V18.26L6 17.6L9 19.6L9.86 19V21.43M11.86 19.96L18 13.83L20.03 15.87L13.9 22H11.86V19.96M21.71 14.19L20.73 15.17L18.69 13.13L19.67 12.15L19.68 12.14L19.69 12.13C19.86 11.97 20.12 11.96 20.31 12.09C20.34 12.1 20.37 12.13 20.39 12.15L21.71 13.47C21.91 13.67 21.91 14 21.71 14.19M17 9V7H7V9H17M15 13V11H7V13H15Z',
};

export { MDI };


export function mdiIcon(pathData) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

// ---- Schnellablage-Ziele beim Ziehen (v.a. schmale Screens) --------------
// Beim Aufnehmen einer Karte erscheinen direkt darunter die übrigen Spalten
// als Drop-Zonen mit gestricheltem Rand, damit man ohne Quer-Scrollen ablegen
// kann. Jede Zone ist eine eigene SortableJS-Liste (group 'cards').
let quickMoveEl = null;
let quickTarget = null;   // Landezone unter dem Zeiger (mobiles Verschieben)
// Karten-IDs mit aufgeklappter Checkliste. Bleibt über Re-Renders erhalten und
// wird je Board im localStorage gemerkt - genau wie die Sortierung der Spalten.
const checkExpanded = new Set();
let checkExpandedBoard = null;

function checkExpandedKey(boardId) { return 'kanban.checkExpanded.' + boardId; }

/** Merkliste auf das gerade angezeigte Board umstellen (nur beim Boardwechsel). */
function loadCheckExpanded(boardId) {
    if (checkExpandedBoard === boardId) return;
    checkExpandedBoard = boardId;
    checkExpanded.clear();
    try {
        const raw = JSON.parse(localStorage.getItem(checkExpandedKey(boardId)) || '[]');
        if (Array.isArray(raw)) for (const id of raw) checkExpanded.add(String(id));
    } catch (e) { /* ignore */ }
}

function saveCheckExpanded() {
    if (!checkExpandedBoard) return;
    try { localStorage.setItem(checkExpandedKey(checkExpandedBoard), JSON.stringify([...checkExpanded])); } catch (e) { /* ignore */ }
}

function isNarrow() {
    return window.matchMedia('(max-width: 820px)').matches;
}

function buildQuickMove(evt, sourceCol, board) {
    removeQuickMove();
    const others = board.columns.filter(c => c.id !== sourceCol.id);
    if (!others.length) return;

    // Die Zonen liegen im rechten Drittel des Fensters. Dort verdecken sie die
    // aufgenommene Karte nicht und sind mit dem Daumen gut erreichbar.
    const bar = el('div', 'quick-move');
    const width = Math.max(120, Math.round(window.innerWidth / 3) - 12);
    const estH = others.length * 82 + (others.length - 1) * 6;
    bar.style.right = '8px';
    bar.style.width = width + 'px';
    bar.style.top = Math.max(8, Math.round((window.innerHeight - estH) / 2)) + 'px';

    for (const c of others) {
        const qt = el('div', 'quick-target' + (c.isTrash ? ' quick-trash' : ''));
        // Der Name liegt in einer eigenen Ebene ueber der Zone, damit ihn nichts
        // verschieben kann.
        qt.appendChild(el('span', 'quick-label', c.isTrash ? t('col.trash') : c.title));
        qt.dataset.colId = c.id;
        bar.appendChild(qt);
    }
    document.body.appendChild(bar);

    // Die Zonen werten den Zeiger selbst aus, statt eigene Sortable-Container zu
    // sein: auf Touch erkennt SortableJS diese kleinen Ziele nicht zuverlaessig.
    document.addEventListener('pointermove', onQuickPointer, true);
    document.addEventListener('touchmove', onQuickPointer, { capture: true, passive: true });
    quickMoveEl = bar;
}

// Zone unter dem Zeiger merken und hervorheben
function onQuickPointer(ev) {
    if (!quickMoveEl) return;
    const p = ev.touches && ev.touches.length ? ev.touches[0] : ev;
    if (p.clientX === undefined) return;
    const hit = document.elementFromPoint(p.clientX, p.clientY);
    const zone = hit && hit.closest ? hit.closest('.quick-target') : null;
    quickTarget = zone && quickMoveEl.contains(zone) ? zone : null;
    for (const z of quickMoveEl.children) z.classList.toggle('sortable-over', z === quickTarget);
}

function removeQuickMove() {
    document.removeEventListener('pointermove', onQuickPointer, true);
    document.removeEventListener('touchmove', onQuickPointer, { capture: true });
    if (quickMoveEl) { quickMoveEl.remove(); quickMoveEl = null; }
    quickTarget = null;
}

function initials(name) {
    return String(name || '?').split(/[\s_-]+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
}

export function userAvatar(state, name) {
    const u = state.users.find(x => x.name === name);
    const label = u ? u.displayName : name;
    if (u && u.avatar) {
        const img = el('img', 'avatar avatar-img');
        img.src = `avatars/${encodeURIComponent(u.name)}?v=${state.avatarVer || 0}`;
        img.alt = label;
        img.title = label;
        if (u.color) img.style.setProperty('--uc', u.color);
        return img;
    }
    const a = el('span', 'avatar', initials(label));
    a.style.background = (u && u.color) || '#888';
    a.style.color = contrastText((u && u.color) || '#888');
    if (u && u.color) a.style.setProperty('--uc', u.color);
    a.title = label;
    return a;
}

function todayStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso, fmt) {
    const [Y, M, D] = String(iso).split('-');
    if (!Y || !M || !D) return String(iso);
    const dt = new Date(+Y, +M - 1, +D);
    const loc = currentLang() || 'en';
    const nm = (opt) => { try { return dt.toLocaleDateString(loc, opt); } catch (e) { return dt.toLocaleDateString('en', opt); } };
    const map = {
        YYYY: Y, YY: Y.slice(-2),
        MMMM: nm({ month: 'long' }), MMM: nm({ month: 'short' }), MM: M, M: String(+M),
        DD: D, D: String(+D),
        dddd: nm({ weekday: 'long' }), ddd: nm({ weekday: 'short' }),
    };
    // Moment/Day.js-Tokens, laengste Alternative zuerst; .replace scannt Ersetztes nicht erneut
    return String(fmt || 'DD.MM.').replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, (tok) => map[tok]);
}
function fmtTime(hhmm, fmt) {
    if (fmt !== '12h') return String(hhmm);
    const parts = String(hhmm).split(':'); let h = +parts[0]; const m = parts[1] || '00';
    const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
}
function p2(n) { return String(n).padStart(2, '0'); }
// ISO-Zeitstempel (z.B. doneAt/trashedAt) in lokale Datum-/Uhrzeit-Teile zerlegen.
function isoLocalParts(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return { D: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, T: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}

// ---- Sortiermodi je Spalte (Feature 1) ----
const SORT_MODES = ['manual', 'grid', 'due', 'priority', 'age'];
const AUTO_SORT_MODES = ['due', 'priority', 'age'];   // eigenes Umsortieren wirkungslos
function sortModeIcon(mode) {
    return ({
        manual: MDI.sortManual, grid: MDI.sortGrid, due: MDI.sortDue,
        priority: MDI.sortPrio, age: MDI.sortAge,
    })[mode] || MDI.sortManual;
}
function cardDueKey(c) { return c.due ? c.due + 'T' + (c.dueTime || '00:00') : ''; }
function byTitle(a, b) { return String(a.title || '').localeCompare(String(b.title || '')); }
// rev dreht immer nur das Hauptkriterium um. Karten ohne Wert bleiben unten,
// Gleichstand entscheidet weiterhin der Titel.
function cmpDue(a, b, rev) {
    const ka = cardDueKey(a), kb = cardDueKey(b);
    if (!ka && !kb) return byTitle(a, b);
    if (!ka) return 1;
    if (!kb) return -1;
    if (ka !== kb) return (rev ? (ka > kb) : (ka < kb)) ? -1 : 1;
    return byTitle(a, b);
}
function cmpPrio(a, b, rev) {
    const pa = Number(a.priority) || 0, pb = Number(b.priority) || 0;
    if (pa !== pb) return rev ? pa - pb : pb - pa;   // Standard: höhere Priorität zuerst
    return cmpDue(a, b, false);
}
// Wann kam die Karte in diese Spalte? movedAt wird nur bei echtem Spaltenwechsel
// gesetzt; nie verschobene Karten liegen seit ihrer Erstellung dort. In einer
// Erledigt-Spalte ist das also der Zeitpunkt des Erledigens.
function inColumnSince(c) { return c.movedAt || c.createdAt || ''; }
// Standard: zuletzt hinzugekommene Karte oben (in Erledigt also das zuletzt
// Erledigte). rev dreht auf aelteste zuerst = laengste Liegezeit oben.
function cmpAge(a, b, rev) {
    const ka = inColumnSince(a), kb = inColumnSince(b);
    if (!ka && !kb) return byTitle(a, b);
    if (!ka) return 1;              // ohne Zeitstempel nach unten
    if (!kb) return -1;
    if (ka !== kb) return (rev ? (ka < kb) : (ka > kb)) ? -1 : 1;
    return byTitle(a, b);
}
function applySort(cards, mode, rev) {
    if (mode === 'due') return cards.slice().sort((a, b) => cmpDue(a, b, rev));
    if (mode === 'priority') return cards.slice().sort((a, b) => cmpPrio(a, b, rev));
    if (mode === 'age') return cards.slice().sort((a, b) => cmpAge(a, b, rev));
    return cards.slice().sort((a, b) => a.order - b.order);   // manual + grid: eigene Reihenfolge
}
function colSortKey(board, col) { return `${board.id}:${col.id}`; }
// Gespeichert wird "<modus>" oder "<modus>:rev" (umgekehrte Richtung).
function getSortMode(state, board, col) {
    const raw = String((state.sortModes && state.sortModes[colSortKey(board, col)]) || '');
    const [m, flag] = raw.split(':');
    return SORT_MODES.includes(m) ? { mode: m, rev: flag === 'rev' } : { mode: 'manual', rev: false };
}
function trashDaysLeft(card, retention) {
    const ts = Date.parse(card.trashedAt || '');
    if (!ts) return retention;
    // Auf [0, retention] begrenzen: geht die Serveruhr minimal vor, ergaebe das
    // Aufrunden sonst retention+1 Tage.
    const left = Math.ceil((ts + retention * 86400000 - Date.now()) / 86400000);
    return Math.max(0, Math.min(retention, left));
}

// Kontextmenü des Sortier-Umschalters
let sortMenuEl = null;
function closeSortMenu() {
    if (sortMenuEl) { sortMenuEl.remove(); sortMenuEl = null; document.removeEventListener('click', onDocClickSort, true); }
}
function onDocClickSort(e) { if (sortMenuEl && !sortMenuEl.contains(e.target)) closeSortMenu(); }
function openSortMenu(btn, state, board, col, actions) {
    closeSortMenu();
    const menu = el('div', 'sort-menu');
    menu.appendChild(el('div', 'sort-menu-title', t('sort.mode')));
    const cur = getSortMode(state, board, col).mode;
    const labels = { manual: t('sort.manual'), grid: t('sort.grid'), due: t('sort.due'), priority: t('sort.priority'), age: t('sort.age') };
    for (const mode of SORT_MODES) {
        const item = el('button', 'sort-item' + (mode === cur ? ' active' : ''));
        item.type = 'button';
        item.appendChild(mdiIcon(sortModeIcon(mode)));
        item.appendChild(el('span', null, labels[mode]));
        // Moduswechsel startet immer in der Standardrichtung
        item.addEventListener('click', (e) => { e.stopPropagation(); closeSortMenu(); actions.setSortMode(colSortKey(board, col), mode); });
        menu.appendChild(item);
    }
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4)) + 'px';
    sortMenuEl = menu;
    setTimeout(() => document.addEventListener('click', onDocClickSort, true), 0);
}

function dueBadge(due, dueTime, done, cfg) {
    const b = el('span', 'badge date-badge');
    b.appendChild(mdiIcon(MDI.calendar));
    b.appendChild(document.createTextNode(' ' + fmtDate(due, cfg && cfg.dateFormat) + (dueTime ? ' ' + fmtTime(dueTime, cfg && cfg.timeFormat) : '')));
    if (done) b.classList.add('due-done');            // erledigt → grün, keine Überfällig-Warnung
    else if (due < todayStr()) b.classList.add('due-overdue');
    else if (due <= todayStr(1)) b.classList.add('due-soon');
    return b;
}

/** Icon je Linkart (Muster: Link-Button der Lovelace-ToDo-Karte,
 *  hier mit typabhängigen Icons im Emoji-Stil der App) */
function linkIcon(url) {
    const u = String(url || '').toLowerCase();
    if (u.startsWith('mailto:')) return MDI.email;
    if (u.startsWith('tel:')) return MDI.phone;
    if (/youtube\.com|youtu\.be/.test(u)) return MDI.youtube;
    if (/\.pdf(\?|#|$)/.test(u)) return MDI.pdf;
    if (/\.(jpe?g|png|gif|webp|svg)(\?|#|$)/.test(u)) return MDI.image;
    if (/waze\.com|\/maps\/dir\/|[?&]daddr=/.test(u)) return MDI.navigation;
    if (/maps\.google|google\.[a-z.]+\/maps|maps\.apple\.com|openstreetmap|^geo:/.test(u)) return MDI.mapMarker;
    // LAN: private Bereiche (RFC1918), Loopback, Link-Local und typische lokale Hostnamen
    if (/^https?:\/\/(10\.\d|127\.\d|169\.254\.\d|192\.168\.\d|172\.(1[6-9]|2\d|3[01])\.\d|(localhost|fritz\.box|[\w-]+\.(local|lan|home|internal|fritz\.box))([:/]|$))/.test(u)) return MDI.link;
    return MDI.web;
}

/** Nur sichere Schemata als klickbaren Link zulassen. Wehrt javascript:/data: u.ä. ab
 *  (Karten sind auch über die API beschreibbar → Link-Inhalt ist nicht vertrauenswürdig). */
function safeHref(url) {
    const u = String(url || '').trim();
    if (/^(https?:|mailto:|tel:|geo:)/i.test(u)) return u;               // erlaubte Schemata
    if (/^(\/|\.\/|\.\.\/)/.test(u)) return u;                            // relative Pfade
    if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(u)) return 'https://' + u;  // host.tld ohne Schema
    return null;                                                          // z.B. javascript:, data:, file: verwerfen
}

function renderCard(state, board, card, actions, opts = {}) {
    const inTrash = !!opts.inTrash;
    const c = el('div', 'card' + (inTrash ? ' card-trash' : '') + (opts.grip ? ' has-grip' : ''));
    c.dataset.cardId = card.id;
    if (card.color && !inTrash) { c.style.setProperty('--card-color', card.color); c.classList.add('has-color'); }

    // Grid-Modus: Anfasser links an der Karte, nur darueber laesst sie sich ziehen
    if (opts.grip) {
        const grip = el('span', 'card-grip');
        grip.appendChild(mdiIcon(MDI.sortGrid));
        grip.title = t('sort.gripTitle');
        c.appendChild(grip);
    }

    const col = (board.columns || []).find(x => x.id === card.columnId);
    const isDone = !!(col && col.isDone);

    // Titel als eigener Textknoten, damit Zusatz-Buttons (Kopieren) daneben passen
    // und die Durchstreichung nur den Text trifft.
    const titleEl = el('div', 'title' + (isDone && !inTrash ? ' title-done' : ''));
    titleEl.appendChild(el('span', 'title-text', card.title));
    c.appendChild(titleEl);

    // Erledigt-Zeitstempel unter dem Titel (Feature 4), im eingestellten Datums-/Zeitformat
    if (isDone && !inTrash && card.doneAt) {
        const parts = isoLocalParts(card.doneAt);
        if (parts) {
            const stamp = `(${t('card.doneLabel')}: ${fmtDate(parts.D, state.cfg && state.cfg.dateFormat)} ${fmtTime(parts.T, state.cfg && state.cfg.timeFormat)})`;
            c.appendChild(el('div', 'done-stamp', stamp));
        }
    }

    const badges = el('div', 'badges');
    if (card.priority > 0) {
        badges.appendChild(el('span', `badge prio-${card.priority}`, card.priority === 2 ? '!!' : '!'));
    }
    if (card.due) badges.appendChild(dueBadge(card.due, card.dueTime, isDone, state.cfg));
    if (card.location) {
        const short = card.location.length > 24 ? card.location.slice(0, 23) + '…' : card.location;
        const loc = el('span', 'badge');
        loc.appendChild(mdiIcon(MDI.mapMarker));
        loc.appendChild(document.createTextNode(' ' + short));
        loc.title = card.location;
        badges.appendChild(loc);
    }
    if (badges.children.length) c.appendChild(badges);

    // Labels in einer eigenen Zeile, damit sie immer unter Prioritaet,
    // Faelligkeit und Ort stehen und nicht dazwischenrutschen.
    const labelRow = el('div', 'badges labels-row');
    for (const lid of card.labels || []) {
        const label = (board.labels || []).find(l => l.id === lid);
        if (!label) continue;
        const pill = el('span', 'label-pill', label.title);
        pill.style.background = label.color || '#888';
        pill.style.color = contrastText(label.color || '#888');
        labelRow.appendChild(pill);
    }
    if (labelRow.children.length) c.appendChild(labelRow);

    // Zustaendige stehen oben rechts im Titel und werden vom Titeltext umflossen
    // (float), damit sie auf jeder Karte an derselben Stelle sitzen, ohne dem
    // Titel pauschal Breite wegzunehmen.
    if (card.assignees && card.assignees.length) {
        const av = el('span', 'avatars');
        card.assignees.forEach((a, i) => {
            const one = userAvatar(state, a);
            one.style.setProperty('--i', i);   // Position im Stapel, fuer das Ausfahren
            av.appendChild(one);
        });
        av.style.setProperty('--n', card.assignees.length);
        // Eng gestapelt; Hover oder Klick faechert sie nach links auf (nur transform,
        // damit sich der umflossene Bereich und der Titelumbruch nicht aendern).
        av.addEventListener('mouseenter', () => av.classList.add('open'));
        av.addEventListener('mouseleave', () => av.classList.remove('open'));
        av.addEventListener('click', ev => { ev.stopPropagation(); av.classList.toggle('open'); });
        c.classList.add('has-avatars');
        titleEl.insertBefore(av, titleEl.firstChild);
    }

    const stopDrag = (b) => { for (const ev of ['pointerdown', 'mousedown', 'touchstart']) b.addEventListener(ev, e => e.stopPropagation()); };

    // Kartenfuss: Checklisten-Zaehler links, Aufklapp-Chevron mittig, Icons fuer
    // Beschreibung, Link und Wiederholung rechts (in dieser Reihenfolge).
    const foot = el('div', 'card-foot');

    if (card.checklist && card.checklist.length) {
        c.classList.add('has-check');
        const clist = el('div', 'card-checklist');
        clist.hidden = !checkExpanded.has(card.id);
        for (const item of card.checklist) {
            const row = el('label', 'card-check-item' + (item.done ? ' done' : ''));
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!item.done;
            cb.addEventListener('change', async ev => {
                ev.stopPropagation();
                const updated = card.checklist.map(i => (i === item ? { ...i, done: cb.checked } : i));
                await actions.updateCard(card.id, { checklist: updated });
            });
            row.append(cb, el('span', 'card-check-text', item.text));
            row.addEventListener('click', ev => ev.stopPropagation());   // Editor nicht öffnen
            clist.appendChild(row);
        }
        const toggle = el('button', 'card-check-toggle');
        const setChkIcon = (open) => { toggle.textContent = ''; toggle.appendChild(mdiIcon(open ? MDI.chevronUp : MDI.chevronDown)); };
        setChkIcon(checkExpanded.has(card.id));
        toggle.type = 'button';
        toggle.title = t('card.checklistToggle');
        toggle.addEventListener('click', ev => {
            ev.stopPropagation();
            const expand = clist.hidden;
            clist.hidden = !expand;
            setChkIcon(expand);
            if (expand) checkExpanded.add(card.id); else checkExpanded.delete(card.id);
            saveCheckExpanded();
        });
        const done = card.checklist.filter(i => i.done).length;
        const count = el('span', 'badge check-count');
        count.appendChild(mdiIcon(MDI.check));
        count.appendChild(document.createTextNode(` ${done}/${card.checklist.length}`));

        foot.append(count, toggle);
        c.appendChild(clist);
    }

    const footIcons = el('span', 'card-foot-icons');
    if (card.description) {
        const nb = el('span', 'badge card-desc-btn');
        nb.appendChild(mdiIcon(MDI_NOTE));
        nb.title = t('badge.description');
        nb.addEventListener('click', ev => { ev.stopPropagation(); actions.openDescription(card.id); });
        stopDrag(nb);
        footIcons.appendChild(nb);
    }
    if (card.link) {
        const href = safeHref(card.link);
        // klickbares Link-Badge nur bei sicherem Schema; sonst nicht-klickbarer Hinweis
        const lb = href ? el('a', 'badge link-badge') : el('span', 'badge link-badge');
        lb.appendChild(mdiIcon(linkIcon(card.link)));
        if (href) {
            lb.href = href;
            if (!/^(mailto:|tel:)/i.test(href)) { lb.target = '_blank'; lb.rel = 'noopener'; }
        }
        lb.title = card.link;
        lb.addEventListener('click', e => e.stopPropagation());
        stopDrag(lb);
        footIcons.appendChild(lb);
    }
    if (card.recurrence && card.recurrence.type && card.recurrence.type !== 'none') {
        const rb = el('span', 'badge');
        rb.appendChild(mdiIcon(MDI.sync));
        rb.title = t('badge.recurring');
        footIcons.appendChild(rb);
    }
    // Ohne Checkliste braucht es keine eigene Fusszeile: die Icons setzen sich
    // rechtsbuendig in die Label- bzw. Badge-Zeile, also auf gleiche Hoehe.
    const inlineRow = labelRow.children.length ? labelRow : (badges.children.length ? badges : null);
    if (footIcons.children.length && !foot.children.length && inlineRow) {
        footIcons.classList.add('inline-icons');
        inlineRow.appendChild(footIcons);
    } else if (footIcons.children.length) {
        foot.appendChild(footIcons);
    }
    if (foot.children.length) c.appendChild(foot);

    // Editor oeffnen - kleines Icon direkt hinter dem Titel. Ein Klick irgendwo
    // auf die Karte oeffnet den Editor bewusst nicht mehr: das passierte zu leicht
    // versehentlich beim Scrollen oder Antippen.
    if (!inTrash) {
        const ed = el('button', 'card-action card-edit');
        ed.type = 'button';
        ed.title = t('card.edit');
        ed.setAttribute('aria-label', ed.title);
        const eic = mdiIcon(MDI.invoiceTextEdit);
        eic.setAttribute('width', '16');
        eic.setAttribute('height', '16');
        ed.appendChild(eic);
        ed.addEventListener('click', e => { e.stopPropagation(); actions.openCard(card.id); });
        stopDrag(ed);
        titleEl.appendChild(ed);
    }

    // Kopieren erledigter Karten (Feature 3) - kleines Icon direkt hinter dem Titel
    if (isDone && !inTrash) {
        const cp = el('button', 'card-action card-copy');
        cp.type = 'button';
        cp.title = t('card.copy');
        cp.setAttribute('aria-label', cp.title);
        const ic = mdiIcon(MDI.contentCopy);
        ic.setAttribute('width', '14');
        ic.setAttribute('height', '14');
        cp.appendChild(ic);
        cp.addEventListener('click', e => { e.stopPropagation(); actions.copyCard(card.id); });
        stopDrag(cp);
        titleEl.appendChild(cp);
    }

    // Papierkorb: Resthinweis + Wiederherstellen/Endgültig-löschen (Feature 5)
    if (inTrash) {
        const retention = (state.cfg && state.cfg.trashRetentionDays) || 30;
        c.appendChild(el('div', 'trash-info', t('trash.daysLeft', { n: trashDaysLeft(card, retention) })));
        const row = el('div', 'trash-actions');
        const rb = el('button', 'card-action trash-restore');
        rb.type = 'button'; rb.title = t('trash.restore'); rb.setAttribute('aria-label', rb.title);
        rb.appendChild(mdiIcon(MDI.restore));
        rb.addEventListener('click', e => { e.stopPropagation(); actions.restoreCard(card.id); });
        const pb = el('button', 'card-action trash-purge');
        pb.type = 'button'; pb.title = t('trash.purge'); pb.setAttribute('aria-label', pb.title);
        pb.appendChild(mdiIcon(MDI.deleteForever));
        pb.addEventListener('click', async e => {
            e.stopPropagation();
            if (await actions.confirm({ title: t('trash.purge'), message: t('confirm.purgeCard'), danger: true, ok: t('trash.purge') })) {
                actions.purgeCard(card.id);
            }
        });
        stopDrag(rb); stopDrag(pb);
        row.append(rb, pb);
        c.appendChild(row);
    }

    return c;
}

// Lesbare Schriftfarbe je nach Hintergrundhelligkeit (YIQ): hell -> schwarz, dunkel -> weiss
export function contrastText(bg) {
    const c = String(bg || '').trim();
    let r, g, b, m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
    else if ((m = /^#([0-9a-f]{6})$/i.exec(c))) { const n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    else return '#fff';
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);   // WCAG relative Luminanz
    return L > 0.31 ? '#000' : '#fff';
}

// Zuweisbare Benutzer des aktiven Boards: Mitglieder, sonst (leer) alle.
/**
 * Wirksame Mitglieder eines beliebigen Boards. Spiegelt die Regel des Servers
 * (lib/store.js, transferCard): Zeigt die Mitgliederliste ins Leere — etwa weil
 * die Benutzer-IDs in den Instanz-Einstellungen umbenannt wurden —, gelten alle
 * bekannten Benutzer. Sonst haette das Board keine Zustaendigen mehr und es
 * liesse sich keine Karte mehr anlegen (Zustaendig ist Pflichtfeld).
 *
 * Gilt fuer jedes Board, nicht nur das gerade angezeigte: Der Uebertragen-Dialog
 * las die Liste frueher roh und hielt ein Board mit leerer Liste faelschlich
 * fuer "niemand zuweisbar".
 */
/**
 * Sichtbaren Ablage-Index in die Ordnung der vollstaendigen Spalte uebersetzen.
 *
 * Der Server versteht `order` als Index in der **vollstaendigen**, nach `order`
 * sortierten Spalte; die Oberflaeche kennt beim Ziehen aber nur die **sichtbaren**
 * Karten. Sobald Personenfilter, `?label=`/`?onlyLabel=`, `doneLimit` oder das
 * Anzeige-Limit einer Spalte etwas ausblenden, meinen beide etwas anderes, und
 * die Karte lag nach dem Neuladen an einer anderen Stelle als abgelegt.
 *
 * Massgeblich ist die Nachbarschaft: Die Karte gehoert vor die naechste sichtbare
 * Karte, sonst hinter die vorherige.
 *
 * @param board Board aus dem State
 * @param columnId Zielspalte
 * @param movedId ID der gezogenen Karte
 * @param listEl DOM-Liste der Zielspalte (enthaelt die Karte bereits)
 * @param visibleIndex Position der Karte in dieser Liste (evt.newIndex)
 */
export function absoluteOrder(board, columnId, movedId, listEl, visibleIndex) {
    const full = (board.cards || [])
        .filter(c => c.columnId === columnId && c.id !== movedId)
        .sort((a, b) => a.order - b.order);
    if (!full.length) return 0;

    const domIds = [...listEl.children]
        .map(node => node && node.dataset && node.dataset.cardId)
        .filter(Boolean);
    const indexOf = id => full.findIndex(c => c.id === id);

    const nextId = domIds[visibleIndex + 1];
    if (nextId) {
        const i = indexOf(nextId);
        if (i !== -1) return i;
    }
    const prevId = visibleIndex > 0 ? domIds[visibleIndex - 1] : null;
    if (prevId) {
        const i = indexOf(prevId);
        if (i !== -1) return i + 1;
    }
    // Keine sichtbaren Nachbarn: oben einsortieren, wenn ganz oben abgelegt,
    // sonst ans Ende.
    return visibleIndex === 0 ? 0 : full.length;
}

export function boardMembers(board, users) {
    const all = (users || []).map(u => u && u.name).filter(Boolean);
    const listed = (board && Array.isArray(board.members) ? board.members : []).filter(n => all.includes(n));
    return listed.length ? listed : all;
}

export function boardUsers(state) {
    const names = new Set(boardMembers(state.board, state.users));
    return (state.users || []).filter(u => names.has(u.name));
}

/**
 * Kartentitel auf zwei Zeilen kuerzen und mit "…" enden lassen.
 * CSS line-clamp scheidet aus, weil der Titel die Avatare umfliesst (float) und
 * ein -webkit-box das Umfliessen aufheben wuerde. Darum per Messung kuerzen.
 */
function clampCardTitles(root) {
    for (const titleEl of root.querySelectorAll('.card .title')) {
        const span = titleEl.querySelector('.title-text');
        if (!span) continue;
        const full = span.dataset.full || span.textContent;
        span.dataset.full = full;
        span.textContent = full;
        titleEl.style.minHeight = '';   // Angleich-Hoehe darf die Messung nicht verfaelschen
        const lh = parseFloat(getComputedStyle(titleEl).lineHeight) || 20;
        const max = lh * 2 + 1;                      // zwei Zeilen plus Rundungsreserve
        if (titleEl.clientHeight <= max) { titleEl.removeAttribute('title'); continue; }
        let lo = 0, hi = full.length;                // binaere Suche nach der laengsten passenden Kuerzung
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            span.textContent = full.slice(0, mid).trimEnd() + '…';
            if (titleEl.clientHeight <= max) lo = mid; else hi = mid - 1;
        }
        span.textContent = full.slice(0, lo).trimEnd() + '…';
        titleEl.title = full;                        // voller Titel im Tooltip
    }
}

/**
 * Titelhoehe je Spalte angleichen: alle Karten einer Spalte bekommen die Hoehe
 * ihres laengsten Titels. Spalten mit lauter einzeiligen Titeln bleiben dadurch
 * kompakt, gemischte Spalten fluchten trotzdem.
 */
function alignCardTitles(root) {
    for (const col of root.querySelectorAll('.column')) {
        const titles = [...col.querySelectorAll('.card .title')];
        if (!titles.length) continue;
        for (const t of titles) t.style.minHeight = '';
        const max = Math.max(...titles.map(t => t.clientHeight));
        for (const t of titles) t.style.minHeight = `${max}px`;
    }
}

let _clampTimer = null;
function reflowTitles(delay = 150) {
    clearTimeout(_clampTimer);
    _clampTimer = setTimeout(() => {
        const b = document.getElementById('board');
        if (b) { clampCardTitles(b); alignCardTitles(b); }
    }, delay);
}
// wie beim ResizeObserver unten: nur registrieren, wenn es ein Fenster gibt
if (typeof window !== 'undefined') window.addEventListener('resize', () => reflowTitles());

/* Spaltenbreite kann sich auch ohne Fensteraenderung aendern, z.B. wenn eine
 * Spalte einen Scrollbalken bekommt. Dann muessen die Titel neu vermessen
 * werden, sonst laufen sie ueber zwei Zeilen hinaus. Nur auf echte
 * Breitenaenderungen reagieren, sonst loest das Kuerzen sich selbst aus. */
const _lastWidth = new WeakMap();
const _widthWatcher = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    let changed = false;
    for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        if (_lastWidth.get(e.target) !== w) { _lastWidth.set(e.target, w); changed = true; }
    }
    if (changed) reflowTitles(60);
}) : null;

export function renderBoard(container, state, actions) {
    // Scrollpositionen merken: das Board wird bei jeder Änderung komplett neu
    // aufgebaut (z. B. nach dem Abhaken eines Checklisten-Punkts), sonst springt
    // die Ansicht dabei an den Anfang.
    const prevScroll = new Map();
    for (const colEl of container.querySelectorAll('.column')) {
        const list = colEl.querySelector('.cards');
        if (colEl.dataset.colId && list) prevScroll.set(colEl.dataset.colId, list.scrollTop);
    }
    const prevLeft = container.scrollLeft;
    const prevPageY = window.scrollY;
    container.textContent = '';
    const board = state.board;
    if (!board) {
        container.appendChild(el('div', 'empty', t('board.empty')));
        return;
    }

    // Aufgeklappte Checklisten dieses Boards laden und dabei Karten-IDs
    // aussortieren, die es nicht mehr gibt (sonst waechst der Eintrag endlos).
    loadCheckExpanded(board.id);
    if (checkExpanded.size) {
        const alive = new Set((board.cards || []).map(c => c.id));
        let dropped = false;
        for (const id of [...checkExpanded]) if (!alive.has(id)) { checkExpanded.delete(id); dropped = true; }
        if (dropped) saveCheckExpanded();
    }

    // Personen-Filter (Kopf-Chips) greift nur bei Teilauswahl:
    // alle aktiv (Standard) oder keiner aktiv => alle Karten sichtbar.
    const _allMembers = boardUsers(state).map(u => u.name);
    const _sel = (state.usersFilter || []).filter(n => _allMembers.includes(n));
    const userSel = (_sel.length > 0 && _sel.length < _allMembers.length) ? _sel : null;

    for (const col of board.columns) {
        if (state.columnsFilter && !state.columnsFilter.includes(col.id)) continue;
        if (col.isTrash && !state.showTrash) continue;   // Papierkorb nur wenn eingeblendet (pro Gerät)
        const colEl = el('div', 'column' + (col.isTrash ? ' trash-col' : ''));
        colEl.dataset.colId = col.id;

        let cards = board.cards
            .filter(c => c.columnId === col.id)
            .sort((a, b) => a.order - b.order);
        if (userSel) {
            cards = cards.filter(c => (c.assignees || []).some(a => userSel.includes(a)));
        }
        if (state.labelOnly && state.labelOnly.length) {
            // Whitelist (?onlyLabel=): nur Karten mit mindestens einem dieser Labels
            cards = cards.filter(c => (c.labels || []).some(l => state.labelOnly.includes(l)));
        }
        if (state.labelFilter && state.labelFilter.length) {
            // Blacklist (?label=): Karten mit einem dieser Labels ausblenden (neue Labels bleiben sichtbar)
            cards = cards.filter(c => !(c.labels || []).some(l => state.labelFilter.includes(l)));
        }
        // Zähler = sichtbare Karten des aktiven Filters (vor der doneLimit-Kürzung)
        const matchedCount = cards.length;
        if (col.isTrash) {
            // Papierkorb: fest nach trashedAt (älteste zuerst = am nächsten zur endgültigen Löschung)
            cards = cards.slice().sort((a, b) => String(a.trashedAt || '').localeCompare(String(b.trashedAt || '')));
        } else {
            // In Erledigt-Spalten optional nur die zuletzt erledigten N Karten zeigen
            if (col.isDone && state.doneLimit != null && cards.length > state.doneLimit) {
                cards = cards.slice()
                    .sort((a, b) => (b.doneAt || b.movedAt || '').localeCompare(a.doneAt || a.movedAt || ''))
                    .slice(0, state.doneLimit);
            }
            const sm = getSortMode(state, board, col);                  // Sortiermodus je Spalte
            cards = applySort(cards, sm.mode, sm.rev);
        }
        // Optionales Anzeige-Limit je Spalte (0 = alle); im Papierkorb nicht anwenden
        let hiddenByMax = 0;
        if (!col.isTrash && col.maxVisible > 0 && cards.length > col.maxVisible) {
            hiddenByMax = cards.length - col.maxVisible;
            cards = cards.slice(0, col.maxVisible);
        }

        const collapsed = state.collapsedCols && state.collapsedCols.has(col.id);
        if (collapsed) colEl.classList.add('collapsed');
        const head = el('div', 'column-head');
        const chev = el('span', 'col-chevron');   // nur mobil sichtbar (CSS)
        const setChev = (c) => { chev.textContent = ''; chev.appendChild(mdiIcon(c ? MDI.chevronRight : MDI.chevronDown)); };
        setChev(collapsed);
        head.appendChild(chev);
        head.appendChild(el('span', null, col.isTrash ? t('col.trash') : col.title));
        const allInCol = board.cards.filter(c => c.columnId === col.id).length;
        // Bei aktivem Personen-/Label-Filter zählt die Kopfzeile die gefilterten (sichtbaren) Karten
        const anyFilter = userSel || (state.labelFilter && state.labelFilter.length) || (state.labelOnly && state.labelOnly.length);
        const count = el('span', 'count', (!anyFilter && col.wipLimit > 0) ? `${allInCol}/${col.wipLimit}` : String(anyFilter ? matchedCount : allInCol));
        head.appendChild(count);
        if (col.wipLimit > 0 && allInCol > col.wipLimit) colEl.classList.add('over-wip');

        // Erledigt-Spalte: Auge-Toggle rechts oben (blendet erledigte Karten ein/aus)
        const isDoneCol = !!col.isDone;
        if (isDoneCol) {
            const eye = el('button', 'col-toggle' + (state.showDone ? '' : ' off'));
            eye.appendChild(mdiIcon(state.showDone ? MDI_EYE : MDI_EYE_CLOSED));
            eye.title = state.showDone ? t('col.hideDone') : t('col.showDone');
            eye.setAttribute('aria-label', eye.title);
            eye.addEventListener('click', () => actions.toggleShowDone());
            head.appendChild(eye);
        }
        // Sortier-Umschalter (nicht im Papierkorb; in Erledigt-Spalten rechts vom Auge).
        // Bei den automatischen Modi steht links davon ein Richtungsumschalter.
        if (!col.isTrash) {
            const { mode: curMode, rev: curRev } = getSortMode(state, board, col);
            if (AUTO_SORT_MODES.includes(curMode)) {
                const dirBtn = el('button', 'col-sort col-sort-dir');
                dirBtn.appendChild(mdiIcon(curRev ? MDI.dirUp : MDI.dirDown));
                dirBtn.title = t('sort.reverse');
                dirBtn.setAttribute('aria-label', dirBtn.title);
                dirBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    actions.setSortMode(colSortKey(board, col), curRev ? curMode : curMode + ':rev');
                });
                head.appendChild(dirBtn);
            }
            const sortBtn = el('button', 'col-sort');
            sortBtn.appendChild(mdiIcon(sortModeIcon(curMode)));
            sortBtn.title = t('sort.mode');
            sortBtn.setAttribute('aria-label', sortBtn.title);
            sortBtn.addEventListener('click', (e) => { e.stopPropagation(); openSortMenu(sortBtn, state, board, col, actions); });
            head.appendChild(sortBtn);
        }
        // Papierkorb: Leeren-Button
        if (col.isTrash) {
            const empt = el('button', 'col-toggle');
            empt.appendChild(mdiIcon(MDI.broom));
            empt.title = t('trash.empty');
            empt.setAttribute('aria-label', empt.title);
            empt.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!board.cards.some(c => c.columnId === col.id)) return;
                if (await actions.confirm({ title: t('trash.empty'), message: t('confirm.emptyTrash'), danger: true, ok: t('trash.empty') })) {
                    actions.emptyTrash();
                }
            });
            head.appendChild(empt);
        }
        // Mobil: Spaltenkopf antippen klappt die Spalte ein/aus
        head.addEventListener('click', (e) => {
            if (!window.matchMedia('(max-width: 600px)').matches) return;   // nur bei gestapelten Spalten
            if (e.target.closest('.col-toggle, button, a')) return;   // Buttons/Links im Kopf nicht abfangen
            const nowCollapsed = colEl.classList.toggle('collapsed');
            setChev(nowCollapsed);
            if (state.collapsedCols) {
                if (nowCollapsed) state.collapsedCols.add(col.id); else state.collapsedCols.delete(col.id);
                try { localStorage.setItem('kanban.collapsedCols', [...state.collapsedCols].join(',')); } catch (e2) { /* ignore */ }
            }
        });
        colEl.appendChild(head);

        const list = el('div', 'cards');
        const sortMode = col.isTrash ? 'manual' : getSortMode(state, board, col).mode;
        const withGrip = sortMode === 'grid';
        const hideCards = isDoneCol && !state.showDone;
        if (!hideCards) {
            for (const card of cards) {
                list.appendChild(renderCard(state, board, card, actions, { inTrash: !!col.isTrash, grip: withGrip }));
            }
        }
        colEl.appendChild(list);
        if (hiddenByMax > 0 && !hideCards) {
            const more = el('div', 'col-more', t('board.moreCards', { n: hiddenByMax }));
            more.title = t('board.moreCardsTitle');
            colEl.appendChild(more);
        }

        const canAdd = !col.isTrash && ((typeof col.allowAdd === 'boolean') ? col.allowAdd : (board.columns[0] && board.columns[0].id === col.id));
        if (canAdd) {
            // Der Button haengt in der Kartenliste, damit er exakt so breit ist
            // wie die Karten (auch wenn die Spalte einen Scrollbalken hat).
            const addBtn = el('button', 'add-card-btn');
            addBtn.type = 'button';
            addBtn.appendChild(mdiIcon(MDI.plus));
            addBtn.title = t('board.addCard');
            addBtn.setAttribute('aria-label', t('board.addCard'));
            addBtn.addEventListener('click', () => actions.openCard(null, col.id));
            list.appendChild(addBtn);
        }

        container.appendChild(colEl);
        if (_widthWatcher) _widthWatcher.observe(list);

        // eslint-disable-next-line no-undef
        Sortable.create(list, {
            group: 'cards',
            draggable: '.card',      // der Plus-Button bleibt liegen
            animation: 150,
            delay: 150,               // Touch: kurz halten zum Ziehen, damit Scrollen möglich bleibt
            delayOnTouchOnly: true,
            // Grid-Modus: nur ueber den Anfasser ziehen
            ...(withGrip ? { handle: '.card-grip' } : {}),
            // Automatische Modi: eigenes Umsortieren waere wirkungslos, Verschieben
            // in andere Spalten bleibt moeglich
            ...(AUTO_SORT_MODES.includes(sortMode) ? { sort: false } : {}),
            ghostClass: 'sortable-ghost',
            filter: '.link-badge, .card-check-toggle, .card-checklist, .card-action, .card-foot-icons, .title .avatars',   // lösen kein Ziehen aus
            preventOnFilter: false,              // damit deren Klick normal durchkommt

            onStart: evt => {
                if (isNarrow()) buildQuickMove(evt, col, board);
            },
            onEnd: evt => {
                const cardId = evt.item.dataset.cardId;
                // Ueber einer Landezone losgelassen? Dann zaehlt deren Spalte,
                // egal wohin SortableJS die Karte gelegt hat.
                const zoneCol = quickTarget && quickTarget.dataset.colId;
                removeQuickMove();
                if (zoneCol) { actions.moveCard(cardId, zoneCol, 0); return; }
                const toEl = evt.to;
                const toCol = toEl.dataset.colId || (toEl.closest('.column') && toEl.closest('.column').dataset.colId);
                if (!toCol) return;
                // evt.newIndex zaehlt nur die sichtbaren Karten — der Server rechnet
                // mit der vollstaendigen Spalte. Ohne Umrechnung landet die Karte in
                // gefilterten Ansichten woanders als abgelegt.
                actions.moveCard(cardId, toCol, absoluteOrder(state.board, toCol, cardId, toEl, evt.newIndex));
            },
        });
    }

    clampCardTitles(container);   // Titel erst messen, wenn die Karten im DOM haengen
    alignCardTitles(container);
    restoreScroll();
    // Nach dem Ausmessen der Titel koennen sich Hoehen aendern -> noch einmal setzen
    requestAnimationFrame(restoreScroll);
    // Nachmessen, sobald Schriften geladen sind: vorher koennen Zeilenhoehen
    // abweichen und Titel faelschlich gekuerzt werden.
    if (document.fonts && document.fonts.status !== 'loaded') {
        document.fonts.ready.then(() => { clampCardTitles(container); alignCardTitles(container); restoreScroll(); }).catch(() => {});
    }

    function restoreScroll() {
        for (const colEl of container.querySelectorAll('.column')) {
            const y = prevScroll.get(colEl.dataset.colId);
            const list = colEl.querySelector('.cards');
            if (y && list) list.scrollTop = y;
        }
        if (prevLeft) container.scrollLeft = prevLeft;
        if (prevPageY) window.scrollTo(0, prevPageY);
    }
}
