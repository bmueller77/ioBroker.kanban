// Karten-Dialog + Board-/Spalten-Verwaltung

import { openColorPicker } from './colorpicker.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { boardUsers, contrastText, mdiIcon, MDI } from './board.js';

const CARD_COLORS = ['', '#e57373', '#ffb74d', '#fff176', '#aed581', '#4fc3f7', '#9575cd', '#f06292', '#a1887f'];
const WEEKDAYS = [['Mo', 1], ['Di', 2], ['Mi', 3], ['Do', 4], ['Fr', 5], ['Sa', 6], ['So', 7]];

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

// Klickbarer Farb-Swatch, der den eingebetteten Colorpicker öffnet.
// Aktuelle Farbe liegt in dataset.color; onChange(col) wird live aufgerufen.
function makeColorTrigger(initial, onChange, opts = {}) {
    const t = el('span', 'cp-trigger');
    t.tabIndex = 0;
    const set = col => { t.dataset.color = col || ''; t.style.background = col || ''; t.classList.toggle('empty', !col); };
    set(initial || '');
    const open = () => openColorPicker(t, t.dataset.color, col => { set(col); if (onChange) onChange(col); },
        { presets: opts.presets || CARD_COLORS });
    t.addEventListener('click', open);
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    return t;
}

function initials(name) {
    return String(name || '?').split(/[\s_-]+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
}

// Bilddatei quadratisch zuschneiden + auf `size` px verkleinern → PNG-Data-URL
function fileToSquareDataUrl(file, size) {
    return loadImageSource(file).then(src => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const dim = Math.min(src.width, src.height);
        ctx.drawImage(src, (src.width - dim) / 2, (src.height - dim) / 2, dim, dim, 0, 0, size, size);
        if (src.close) src.close();
        return c.toDataURL('image/png');
    });
}

// Laedt eine Bilddatei OHNE blob:-URL (CSP-konform): bevorzugt createImageBitmap,
// Fallback ueber eine data:-URL (von der CSP erlaubt), da img-src kein blob: zulaesst.
function loadImageSource(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Bild konnte nicht gelesen werden')); };
            img.src = fr.result;
        };
        fr.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden')); };
        fr.readAsDataURL(file);
    });
}

function slugify(text) {
    return String(text || '').toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

export function initDialogs(state, actions) {
    const dlg = document.getElementById('cardDialog');
    const form = document.getElementById('cardForm');
    // Monats-Select einmalig lokalisiert befüllen (defensiv: bricht nicht die
    // ganze App ab, falls veraltetes HTML gecacht wurde und das Feld fehlt)
    const recMonthSel = form && form.elements ? form.elements.recMonth : null;
    if (recMonthSel && !recMonthSel.options.length) {
        for (let m = 1; m <= 12; m++) recMonthSel.appendChild(new Option(t('month.' + m), String(m)));
    }
    // Listener nur setzen, wenn das Feld existiert (robust gegen veraltetes HTML)
    const on = (name, ev, fn) => { const e = form.elements[name]; if (e) e.addEventListener(ev, fn); };
    let editingCardId = null;
    let selAssignees = new Set();
    let selLabels = new Set();
    let selColor = '';

    // ---------------------------------------------------------- Karten-Dialog

    function renderAssigneePick() {
        const box = document.getElementById('assigneePick');
        box.textContent = '';
        const list = boardUsers(state).slice();
        for (const u of (state.users || [])) if (selAssignees.has(u.name) && !list.some(x => x.name === u.name)) list.push(u);
        for (const u of list) {
            const chip = el('span', 'pick-chip', u.displayName);
            chip.style.borderColor = selAssignees.has(u.name) ? (u.color || '') : '';
            if (selAssignees.has(u.name)) chip.classList.add('selected');
            chip.addEventListener('click', () => {
                selAssignees.has(u.name) ? selAssignees.delete(u.name) : selAssignees.add(u.name);
                renderAssigneePick();
            });
            box.appendChild(chip);
        }
        updateAssigneeValidity();
    }

    // Pflicht: mindestens ein Zustaendiger. Proxy-Input traegt die (lokalisierte)
    // Fehlermeldung, damit die native Browser-Blase erscheint - wie beim Titel.
    function updateAssigneeValidity() {
        const p = document.getElementById('assigneeValidity');
        if (p) p.setCustomValidity(selAssignees.size ? '' : t('card.assigneeRequired'));
    }

    function renderLabelPick() {
        const box = document.getElementById('labelPick');
        box.textContent = '';
        for (const l of (state.board && state.board.labels) || []) {
            const chip = el('span', 'pick-chip', l.title);
            if (selLabels.has(l.id)) {
                chip.classList.add('selected');
                chip.style.background = l.color || '';
                chip.style.color = contrastText(l.color || '#888');
            }
            chip.addEventListener('click', () => {
                selLabels.has(l.id) ? selLabels.delete(l.id) : selLabels.add(l.id);
                renderLabelPick();
            });
            box.appendChild(chip);
        }
        const add = el('span', 'pick-chip', t('label.new'));
        add.addEventListener('click', () => showLabelCreator(box));
        box.appendChild(add);
    }

    // Inline-Mini-Form zum Anlegen eines Labels (Name + echter Colorpicker)
    function showLabelCreator(box) {
        if (box.querySelector('.label-new')) return;
        const form = el('span', 'label-new');
        const color = makeColorTrigger('#4CAF50');
        const name = document.createElement('input');
        name.type = 'text';
        name.placeholder = t('label.namePlaceholder');
        name.maxLength = 40;
        const ok = el('button', 'mini', '✓'); ok.type = 'button';
        const cancel = el('button', 'mini', '×'); cancel.type = 'button';
        const submit = async () => {
            const title = name.value.trim();
            if (!title) { name.focus(); return; }
            const id = slugify(title);
            const col = color.dataset.color || '#4CAF50';
            const existing = (state.board && state.board.labels) || [];
            const labels = existing.some(l => l.id === id)
                ? existing.map(l => l.id === id ? { ...l, title, color: col } : l)
                : [...existing, { id, title, color: col }];
            await actions.patchBoard({ labels });
            selLabels.add(id);
            renderLabelPick();
        };
        ok.addEventListener('click', submit);
        name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        cancel.addEventListener('click', () => renderLabelPick());
        form.append(color, name, ok, cancel);
        box.insertBefore(form, box.lastChild);   // vor den "+ Neu"-Chip
        name.focus();
    }

    function renderColorPick() {
        const box = document.getElementById('colorPick');
        box.textContent = '';
        const swatches = [];
        for (const c of CARD_COLORS) {
            const sw = el('span', 'color-swatch' + (c ? '' : ' none'));
            if (c) sw.style.background = c;
            sw.dataset.color = c;
            sw.addEventListener('click', () => { selColor = c; updateSelection(); });
            box.appendChild(sw);
            swatches.push(sw);
        }
        // Freie Farbwahl (voller Farbraum) über den eigenen Colorpicker
        const custom = el('span', 'color-swatch custom');
        custom.title = t('color.own');
        custom.tabIndex = 0;
        const openCustom = () => openColorPicker(custom, selColor, col => { selColor = col; updateSelection(); }, { presets: CARD_COLORS });
        custom.addEventListener('click', openCustom);
        custom.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCustom(); } });
        box.appendChild(custom);

        function updateSelection() {
            const isCustom = selColor && !CARD_COLORS.includes(selColor);
            for (const sw of swatches) sw.classList.toggle('selected', sw.dataset.color === selColor);
            custom.classList.toggle('selected', !!isCustom);
            custom.style.background = isCustom ? selColor : '';
        }
        updateSelection();
    }

    function addCheckRow(item) {
        const box = document.getElementById('checklistEdit');
        const row = el('div', 'check-item');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!(item && item.done);
        const txt = document.createElement('input');
        txt.type = 'text';
        txt.value = (item && item.text) || '';
        txt.placeholder = t('card.checkPlaceholder');
        const rm = el('button', 'rm', '×');
        rm.type = 'button';
        rm.addEventListener('click', () => row.remove());
        row.append(cb, txt, rm);
        box.appendChild(row);
        return row;
    }

    function readChecklist() {
        return [...document.querySelectorAll('#checklistEdit .check-item')]
            .map(row => ({
                text: row.querySelector('input[type=text]').value.trim(),
                done: row.querySelector('input[type=checkbox]').checked,
            }))
            .filter(i => i.text);
    }

    function fillColumnSelect(selected) {
        const sel = form.elements.columnId;
        sel.textContent = '';
        for (const c of (state.board && state.board.columns) || []) {
            if (c.isTrash) continue;   // Papierkorb ist kein wählbares Ziel
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.title;
            sel.appendChild(o);
        }
        if (selected) sel.value = selected;
    }

    function isoTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /**
     * Markdown rendern und sicher einfuegen. Links oeffnen immer in einem neuen
     * Tab (target=_blank + rel), damit das Board nicht verlassen wird.
     */
    function renderMarkdownInto(target, text) {
        const txt = String(text || '').trim();
        if (!txt) { target.textContent = ''; return; }
        // eslint-disable-next-line no-undef
        const html = marked.parse(txt);
        // Markdown darf rohes HTML enthalten → vor dem Einfügen säubern (verhindert gespeichertes XSS).
        // eslint-disable-next-line no-undef
        if (window.DOMPurify) target.innerHTML = DOMPurify.sanitize(html);
        else { target.textContent = txt; return; }   // Fallback ohne Sanitizer: nur Text
        for (const a of target.querySelectorAll('a[href]')) {
            if (/^(mailto:|tel:)/i.test(a.getAttribute('href') || '')) continue;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
    }

    // Beschreibung nur lesend anzeigen (Klick auf das Notiz-Icon der Karte).
    function openDescription(cardId) {
        const card = state.board && state.board.cards.find(c => c.id === cardId);
        if (!card || !card.description) return;
        const dd = document.getElementById('descDialog');
        const body = document.getElementById('descDialogBody');
        body.textContent = '';
        body.appendChild(el('h3', 'desc-title', card.title || ''));
        const md = el('div', 'md-preview desc-body');
        renderMarkdownInto(md, card.description);
        body.appendChild(md);
        const foot = el('div', 'desc-foot');
        const close = el('button', null, t('desc.close'));
        close.type = 'button';
        close.addEventListener('click', () => dd.close());
        foot.appendChild(close);
        body.appendChild(foot);
        // Klick auf den Bereich ausserhalb (der Dialog selbst fuellt nur den
        // Rahmen, der Inhalt liegt in #descDialogBody) schliesst das Fenster.
        if (!dd.dataset.wired) {
            dd.dataset.wired = '1';
            dd.addEventListener('mousedown', ev => { if (ev.target === dd) dd.close(); });
        }
        dd.showModal();
    }

    // Feature 3: erledigte Karte kopieren → Editor als NEUE Karte mit gleichen Inhalten.
    function copyCard(cardId) {
        const src = state.board && state.board.cards.find(c => c.id === cardId);
        if (!src) return;
        editingCardId = null;
        document.getElementById('cardDialogTitle').textContent = t('card.titleNew');
        document.getElementById('deleteCardBtn').hidden = true;
        document.getElementById('transferCardBtn').hidden = true;
        form.elements.title.value = src.title || '';
        form.elements.description.value = src.description || '';
        // Fälligkeit: heutiges Datum, wenn das Original eins hatte (Uhrzeit behalten), sonst leer
        const hadDue = !!src.due;
        form.elements.due.value = hadDue ? isoTodayStr() : '';
        form.elements.dueTime.value = (hadDue && src.dueTime) ? src.dueTime : '';
        form.elements.dueTimeEnabled.checked = !!(hadDue && src.dueTime);
        updateDueTimeUI();
        form.elements.priority.value = String(src.priority || 0);
        form.elements.link.value = src.link || '';
        form.elements.location.value = src.location || '';
        form.elements.calendarInvite.checked = !!src.calendarInvite;
        // Zielspalte: erste „Neu"-Spalte, sonst erste normale Spalte
        const cols = (state.board.columns || []).filter(c => !c.isTrash);
        const target = cols.find(c => c.allowAdd) || cols[0];
        fillColumnSelect(target && target.id);
        selAssignees = new Set(src.assignees || []);
        selLabels = new Set(src.labels || []);
        selColor = src.color || '';
        renderAssigneePick();
        renderLabelPick();
        renderColorPick();
        const box = document.getElementById('checklistEdit');
        box.textContent = '';
        for (const item of (src.checklist || [])) addCheckRow({ text: item.text, done: false });
        loadRecurrence(src.recurrence);
        updatePreview();
        dlg.showModal();
    }

    function openCard(cardId, defaultColumnId) {
        const card = cardId && state.board ? state.board.cards.find(c => c.id === cardId) : null;
        editingCardId = card ? card.id : null;
        document.getElementById('cardDialogTitle').textContent = card ? t('card.titleEdit') : t('card.titleNew');
        document.getElementById('deleteCardBtn').hidden = !card;
        // Auch bei nur einem Board sinnvoll: der Dialog kann die Karte klonen
        document.getElementById('transferCardBtn').hidden = !card;
        form.elements.title.value = card ? card.title : '';
        form.elements.description.value = card ? card.description : '';
        form.elements.due.value = (card && card.due) || '';
        form.elements.dueTime.value = (card && card.dueTime) || '';
        form.elements.dueTimeEnabled.checked = !!(card && card.dueTime);
        updateDueTimeUI();
        form.elements.priority.value = String((card && card.priority) || 0);
        form.elements.link.value = (card && card.link) || '';
        form.elements.location.value = (card && card.location) || '';
        form.elements.calendarInvite.checked = !!(card && card.calendarInvite);
        fillColumnSelect(card ? card.columnId : defaultColumnId);
        selAssignees = new Set(card ? card.assignees : []);
        selLabels = new Set(card ? card.labels : []);
        selColor = (card && card.color) || '';
        renderAssigneePick();
        renderLabelPick();
        renderColorPick();
        const box = document.getElementById('checklistEdit');
        box.textContent = '';
        for (const item of (card && card.checklist) || []) addCheckRow(item);
        loadRecurrence(card && card.recurrence);
        updatePreview();
        dlg.showModal();
    }

    // ---- Wiederholung ------------------------------------------------------
    let selWeekdays = new Set();

    function renderWeekdayPick() {
        const box = document.getElementById('recWeekdayWrap');
        box.textContent = '';
        // Bei "Monatlich (Wochentag)" nur EIN Wochentag, sonst Mehrfachauswahl.
        const single = form.elements.recType.value === 'monthly_weekday';
        for (const [, iso] of WEEKDAYS) {
            const chip = el('span', 'pick-chip' + (selWeekdays.has(iso) ? ' selected' : ''), t('weekday.' + iso));
            chip.addEventListener('click', () => {
                if (single) selWeekdays = new Set([iso]);
                else if (selWeekdays.has(iso)) selWeekdays.delete(iso);
                else selWeekdays.add(iso);
                renderWeekdayPick();
                updateRecUI();
            });
            box.appendChild(chip);
        }
    }

    function loadRecurrence(rec) {
        rec = rec || {};
        form.elements.recType.value = rec.type || 'none';
        form.elements.recInterval.value = rec.interval || 2;
        form.elements.recDom.value = rec.dayOfMonth || (new Date().getDate());
        form.elements.recMonth.value = String(rec.month || (new Date().getMonth() + 1));
        form.elements.recOrdinal.value = String(rec.ordinal || 1);
        form.elements.recWorkdayPos.value = rec.workdayPos || 'first';
        form.elements.recWorkdayN.value = rec.n || 1;
        const initWd = (rec.dayOfWeek && rec.dayOfWeek.length) ? rec.dayOfWeek : [isoToday()];
        selWeekdays = new Set(rec.type === 'monthly_weekday' ? [initWd[0]] : initWd);
        renderWeekdayPick();
        updateRecUI();
    }

    function isoToday() { const d = new Date().getDay(); return d === 0 ? 7 : d; }

    function updateRecUI() {
        const type = form.elements.recType.value;
        const pos = form.elements.recWorkdayPos.value;
        document.getElementById('recWeekdayWrap').hidden = !(type === 'weekly' || type === 'monthly_weekday');
        document.getElementById('recIntervalWrap').hidden = type !== 'every_n_days';
        document.getElementById('recDomWrap').hidden = !(type === 'monthly' || type === 'yearly');
        document.getElementById('recMonthWrap').hidden = type !== 'yearly';
        document.getElementById('recOrdinalWrap').hidden = type !== 'monthly_weekday';
        document.getElementById('recWorkdayPosWrap').hidden = type !== 'workday';
        document.getElementById('recWorkdayNWrap').hidden = !(type === 'workday' && (pos === 'nth' || pos === 'nth_last'));
        const hint = document.getElementById('recHint');
        const txt = type === 'none' ? '' : t('rec.hint.' + type);
        hint.hidden = !txt;
        hint.textContent = txt || '';
    }

    on('recType', 'change', () => { renderWeekdayPick(); updateRecUI(); });
    on('recWorkdayPos', 'change', updateRecUI);

    function readRecurrence() {
        const t = form.elements.recType.value;
        if (t === 'none') return null;
        const rec = { type: t };
        if (t === 'weekly') rec.dayOfWeek = [...selWeekdays].sort((a, b) => a - b);
        if (t === 'monthly' || t === 'yearly') rec.dayOfMonth = Number(form.elements.recDom.value) || 1;
        if (t === 'yearly') rec.month = Number(form.elements.recMonth.value) || 1;
        if (t === 'monthly_weekday') {
            rec.dayOfWeek = [[...selWeekdays][0] || isoToday()];
            rec.ordinal = Number(form.elements.recOrdinal.value) || 1;
        }
        if (t === 'workday') {
            rec.workdayPos = form.elements.recWorkdayPos.value || 'first';
            if (rec.workdayPos === 'nth' || rec.workdayPos === 'nth_last') {
                rec.n = Math.max(1, Number(form.elements.recWorkdayN.value) || 1);
            }
        }
        if (t === 'every_n_days') {
            rec.interval = Math.max(1, Number(form.elements.recInterval.value) || 1);
            rec.startDate = form.elements.due.value || null;   // Referenzpunkt = Fälligkeit
        }
        return rec;
    }

    function updateDueTimeUI() {
        document.getElementById('dueTimeWrap').hidden = !form.elements.dueTimeEnabled.checked;
    }
    on('dueTimeEnabled', 'change', () => {
        updateDueTimeUI();
        if (form.elements.dueTimeEnabled.checked && !form.elements.dueTime.value) {
            form.elements.dueTime.value = '09:00';   // sinnvoller Default
        }
    });

    function updatePreview() {
        const prev = document.getElementById('descPreview');
        const txt = form.elements.description.value.trim();
        if (!txt) { prev.hidden = true; return; }
        prev.hidden = false;
        renderMarkdownInto(prev, txt);
    }

    on('description', 'input', updatePreview);
    document.getElementById('addCheckItem').addEventListener('click', () => {
        addCheckRow().querySelector('input[type=text]').focus();
    });
    document.getElementById('cancelCardBtn').addEventListener('click', () => dlg.close());
    document.getElementById('deleteCardBtn').addEventListener('click', async () => {
        if (!editingCardId) return;
        if (!await confirmDialog({ title: t('card.delete'), message: t('confirm.deleteCard'), danger: true, ok: t('card.delete') })) return;
        await actions.deleteCard(editingCardId);
        dlg.close();
    });
    document.getElementById('transferCardBtn').addEventListener('click', () => {
        if (editingCardId) openTransfer(editingCardId);
    });

    // Titel-Pflichtmeldung in Board-Sprache statt Browser-Standardtext.
    form.elements.title.addEventListener('invalid', () => form.elements.title.setCustomValidity(t('card.titleRequired')));
    form.elements.title.addEventListener('input', () => form.elements.title.setCustomValidity(''));

    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const data = {
            title: form.elements.title.value.trim(),
            description: form.elements.description.value,
            due: form.elements.due.value,
            dueTime: (form.elements.dueTimeEnabled.checked && form.elements.due.value)
                ? form.elements.dueTime.value : '',
            priority: Number(form.elements.priority.value),
            link: form.elements.link.value.trim(),
            location: form.elements.location.value.trim(),
            calendarInvite: form.elements.calendarInvite.checked,
            assignees: [...selAssignees],
            labels: [...selLabels],
            color: selColor,
            checklist: readChecklist(),
            recurrence: readRecurrence(),
            columnId: form.elements.columnId.value,
        };
        if (!data.title) return;
        if (!data.assignees.length) { updateAssigneeValidity(); const p = document.getElementById('assigneeValidity'); if (p) p.reportValidity(); return; }
        try {
            if (editingCardId) {
                await actions.updateCard(editingCardId, data);
                const card = state.board.cards.find(c => c.id === editingCardId);
                if (card && card.columnId !== data.columnId) {
                    await actions.moveCard(editingCardId, data.columnId);
                }
            } else {
                await actions.addCard(data);
            }
            dlg.close();
        } catch (e) {
            alert(t('error.saveFailed', { msg: e.message }));
        }
    });

    // ---------------------------------------------------------- Board-Verwaltung

    const bdlg = document.getElementById('boardDialog');

    async function openBoardManager() {
        const body = document.getElementById('boardDialogBody');
        body.textContent = '';
        body.appendChild(el('h3', null, t('settings.title')));

        const tabbar = el('div', 'tabbar');
        const panels = el('div', 'tab-panels');
        body.append(tabbar, panels);
        const tabs = [];
        const activate = id => {
            for (const tb of tabs) { const on = tb.id === id; tb.btn.classList.toggle('active', on); tb.panel.hidden = !on; }
        };
        const addTab = (id, label, build) => {
            const btn = el('button', 'tab-btn', label); btn.type = 'button';
            const panel = el('div', 'tab-panel'); panel.hidden = true;
            build(panel);
            btn.addEventListener('click', () => activate(id));
            tabbar.appendChild(btn); panels.appendChild(panel);
            tabs.push({ id, btn, panel });
        };

        // Bearbeitetes Board (Dropdown) - unabhaengig vom aktiven Board
        let editId = (state.board && state.board.id) || (state.boards[0] && state.boards[0].id) || '';
        let editBoard = null;
        let dirty = false;
        let titleInput = null, colBox = null, labelBox = null, linkTargetSel = null, linkUrlInput = null;
        let cleanupModeSel = null, cleanupDaysInp = null, cleanupCountInp = null, memberWrap = null;
        let saveBtn = null, boardPanel = null, boardSel = null;

        const validateMembers = () => {
            if (!saveBtn) return;
            const bad = !!memberWrap && memberWrap.querySelectorAll('input:checked').length === 0;
            saveBtn.disabled = bad;
            saveBtn.title = bad ? t('boards.membersRequiredShort') : '';
        };

        async function loadEdit(id) {
            try { editBoard = await api(`api/boards/${encodeURIComponent(id)}`); }
            catch (e) { editBoard = null; }
        }

        // Aenderungen des bearbeiteten Boards einsammeln und speichern
        async function saveEdit() {
            if (!editBoard) return true;
            const members = memberWrap ? [...memberWrap.querySelectorAll('input:checked')].map(i => i.dataset.val) : undefined;
            if (memberWrap && !members.length) {
                await confirmDialog({ title: t('boards.members'), message: t('boards.membersRequiredShort'), ok: t('confirm.ok') });
                return false;
            }
            const columns = [...colBox.children].map(row => ({
                id: row.dataset.colId || undefined,
                title: row.querySelector('input[type=text]').value.trim() || '?',
                maxVisible: Number(row.querySelector('.col-max').value) || 0,
                wipLimit: Number(row.querySelector('.col-wip').value) || 0,
                isDone: row.querySelector('.col-done').checked,
                allowAdd: row.querySelector('.col-add').checked,
            }));
            const labels = [...labelBox.children].map(row => {
                const title = row.querySelector('input[type=text]').value.trim();
                if (!title) return null;
                return {
                    id: row.dataset.labelId || slugify(title),
                    title,
                    color: row.querySelector('.cp-trigger').dataset.color || '#4CAF50',
                };
            }).filter(Boolean);
            await actions.patchBoardById(editBoard.id, {
                title: titleInput.value.trim() || editBoard.title,
                columns, labels,
                linkTarget: linkTargetSel ? linkTargetSel.value : undefined,
                linkUrl: linkUrlInput ? linkUrlInput.value.trim() : undefined,
                cleanup: cleanupModeSel ? { mode: cleanupModeSel.value, days: Number(cleanupDaysInp.value) || 90, count: Number(cleanupCountInp.value) || 100 } : undefined,
                members,
            });
            dirty = false;
            return true;
        }

        // Beim Wechsel des bearbeiteten Boards nach ungespeicherten Aenderungen fragen
        async function guardUnsaved() {
            if (!dirty) return true;
            const r = await confirmDialog({
                title: t('boards.unsavedTitle'), message: t('boards.unsavedMsg'),
                ok: t('boards.save'), extra: t('boards.discard'),
            });
            if (r === true) return await saveEdit();
            if (r === 'extra') { dirty = false; return true; }
            return false;
        }

        async function switchEdit(id) {
            if (!await guardUnsaved()) { if (boardSel) boardSel.value = editId; return; }
            editId = id;
            await loadEdit(editId);
            buildBoardPanel(boardPanel);
            validateMembers();
        }

        function buildBoardPanel(panel) {
            panel.textContent = '';
            dirty = false;
            titleInput = colBox = labelBox = linkTargetSel = linkUrlInput = null;
            cleanupModeSel = cleanupDaysInp = cleanupCountInp = memberWrap = null;
            if (!editBoard) { panel.appendChild(el('div', 'hint', t('board.empty'))); return; }

            // ---- Kopfzeile: Board-Auswahl | Anzeigen | neues Board | Anlegen ----
            const topRow = el('div', 'row board-toprow');
            boardSel = document.createElement('select');
            for (const b of state.boards) {
                const o = document.createElement('option');
                o.value = b.id; o.textContent = b.title;
                boardSel.appendChild(o);
            }
            boardSel.value = editId;
            boardSel.title = t('boards.editingBoard');
            boardSel.dataset.noDirty = '1';   // Board-Wechsel ist keine Aenderung am Board
            boardSel.addEventListener('change', () => switchEdit(boardSel.value));

            const showBtn = el('button', 'icon-btn');
            showBtn.type = 'button';
            showBtn.appendChild(mdiIcon(MDI.arrowRightCircle));
            showBtn.title = t('boards.showBoard');
            showBtn.setAttribute('aria-label', showBtn.title);
            showBtn.disabled = !!(state.board && state.board.id === editId);
            showBtn.addEventListener('click', async () => {
                if (state.board && state.board.id === editId) return;
                const b = state.boards.find(x => x.id === editId);
                if (!await confirmDialog({ title: t('boards.showBoard'), message: t('boards.showConfirm', { title: (b && b.title) || editId }), ok: t('boards.showBoard') })) return;
                await actions.switchBoard(editId);
                showBtn.disabled = true;
            });

            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.placeholder = t('boards.newBoard');
            newInput.className = 'board-new-name';
            newInput.dataset.noDirty = '1';   // Name fuer ein NEUES Board, keine Aenderung am aktuellen
            const newBtn = el('button', 'primary', t('boards.create'));
            newBtn.type = 'button';
            newBtn.addEventListener('click', async () => {
                const title = newInput.value.trim();
                if (!title) { newInput.focus(); return; }
                if (!await guardUnsaved()) return;
                const created = await actions.createBoardOnly(title);
                newInput.value = '';
                editId = created.id;
                await loadEdit(editId);
                buildBoardPanel(boardPanel);
                validateMembers();
            });
            topRow.append(boardSel, showBtn, newInput, newBtn);
            panel.appendChild(topRow);

            // ---- Board-Titel ----
            const titleLabel = el('label', null, t('boards.boardTitle'));
            titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = editBoard.title;
            titleLabel.appendChild(titleInput);
            panel.appendChild(titleLabel);

            // ---- Mitglieder (zuweisbare Benutzer) ----
            if ((state.users || []).length) {
                panel.appendChild(el('label', null, t('boards.members')));
                panel.appendChild(el('div', 'hint', t('boards.membersHint')));
                memberWrap = el('div', 'share-cols');
                const cur = Array.isArray(editBoard.members) ? editBoard.members : [];
                for (const u of state.users) {
                    const lab = el('label', 'inline');
                    const inp = document.createElement('input');
                    inp.type = 'checkbox'; inp.dataset.val = u.name; inp.checked = cur.includes(u.name);
                    inp.addEventListener('change', validateMembers);
                    lab.append(inp, document.createTextNode(' ' + (u.displayName || u.name)));
                    memberWrap.appendChild(lab);
                }
                panel.appendChild(memberWrap);
            }

            // ---- Spalten ----
            panel.appendChild(el('label', null, t('boards.columns')));
            const chead = el('div', 'col-head');
            const hcell = (cls, label, tip) => { const s = el('span', cls, label); s.title = tip; return s; };
            chead.append(
                el('span', 'h-drag'),
                hcell('h-name', t('boards.colTitle'), t('boards.legendTitle')),
                hcell('h-num', t('boards.colMax'), t('boards.legendMax')),
                hcell('h-num', t('boards.colWip'), t('boards.legendWip')),
                hcell('h-new', t('boards.allowAdd'), t('boards.legendAdd')),
                hcell('h-done', t('boards.done'), t('boards.legendDone')),
                el('span', 'h-rm'),
            );
            panel.appendChild(chead);
            colBox = el('div');
            colBox.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const mkColRow = (col, i) => {
                const row = el('div', 'col-edit');
                row.dataset.colId = col.id || '';
                const drag = el('span', 'drag', '⠳');
                const name = document.createElement('input');
                name.type = 'text';
                name.value = col.title;
                name.placeholder = t('boards.columnName');
                name.title = t('boards.legendTitle');
                const max = document.createElement('input');
                max.type = 'number'; max.min = '0';
                max.value = String(col.maxVisible || 0);
                max.title = t('boards.maxTitle');
                max.className = 'col-max';
                const wip = document.createElement('input');
                wip.type = 'number'; wip.min = '0';
                wip.value = String(col.wipLimit || 0);
                wip.title = t('boards.wipTitle');
                wip.className = 'col-wip';
                const doneLbl = el('label', 'col-chk c-done');
                const done = document.createElement('input');
                done.type = 'checkbox'; done.className = 'col-done';
                done.checked = !!col.isDone;
                done.title = t('boards.legendDone'); done.setAttribute('aria-label', t('boards.done'));
                doneLbl.appendChild(done);
                const addLbl = el('label', 'col-chk c-new');
                const addChk = document.createElement('input');
                addChk.type = 'checkbox'; addChk.className = 'col-add';
                addChk.checked = (typeof col.allowAdd === 'boolean') ? col.allowAdd : (i === 0);
                addChk.title = t('boards.legendAdd'); addChk.setAttribute('aria-label', t('boards.allowAdd'));
                addLbl.appendChild(addChk);
                const rm = el('button', 'rm', '×');
                rm.type = 'button';
                rm.title = t('boards.deleteColumnTitle');
                rm.addEventListener('click', () => { row.remove(); dirty = true; });
                drag.title = t('boards.dragTitle');
                row.append(drag, name, max, wip, addLbl, doneLbl, rm);
                return row;
            };
            // Papierkorb ist eine Systemspalte und wird hier nicht bearbeitet
            (editBoard.columns || []).filter(c => !c.isTrash).forEach((col, i) => colBox.appendChild(mkColRow(col, i)));
            panel.appendChild(colBox);
            // eslint-disable-next-line no-undef
            Sortable.create(colBox, { handle: '.drag', animation: 150, onEnd: () => { dirty = true; } });
            const addCol = el('button', 'linkbtn', t('boards.addColumn'));
            addCol.addEventListener('click', () => { colBox.appendChild(mkColRow({ title: '', maxVisible: 0, wipLimit: 0, isDone: false, allowAdd: false })); dirty = true; });
            panel.appendChild(addCol);

            // ---- Labels ----
            panel.appendChild(el('label', null, t('boards.labels')));
            labelBox = el('div');
            labelBox.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const mkLabelRow = lab => {
                const row = el('div', 'label-edit');
                row.dataset.labelId = lab.id || '';
                const color = makeColorTrigger(lab.color || '#4CAF50', () => { dirty = true; });
                const name = document.createElement('input');
                name.type = 'text';
                name.value = lab.title || '';
                name.placeholder = t('label.namePlaceholder');
                const rm = el('button', 'rm', '×');
                rm.type = 'button';
                rm.title = t('boards.deleteLabelTitle');
                rm.addEventListener('click', () => { row.remove(); dirty = true; });
                row.append(color, name, rm);
                return row;
            };
            for (const lab of editBoard.labels || []) labelBox.appendChild(mkLabelRow(lab));
            panel.appendChild(labelBox);
            const addLabel = el('button', 'linkbtn', t('boards.addLabel'));
            addLabel.addEventListener('click', () => { labelBox.appendChild(mkLabelRow({ color: '#4CAF50' })); dirty = true; });
            panel.appendChild(addLabel);

            // ---- Link-Ziel fuer Benachrichtigungen ----
            panel.appendChild(el('label', null, t('boards.linkTarget')));
            linkTargetSel = document.createElement('select');
            for (const [val, key] of [['board', 'boards.linkBoard'], ['edit', 'boards.linkEdit'], ['url', 'boards.linkUrl']]) {
                const o = document.createElement('option');
                o.value = val; o.textContent = t(key);
                linkTargetSel.appendChild(o);
            }
            linkTargetSel.value = editBoard.linkTarget || 'board';
            panel.appendChild(linkTargetSel);
            const linkUrlWrap = el('label', null, t('boards.linkUrlField'));
            linkUrlInput = document.createElement('input');
            linkUrlInput.type = 'url';
            linkUrlInput.placeholder = 'https://…';
            linkUrlInput.value = editBoard.linkUrl || '';
            linkUrlWrap.appendChild(linkUrlInput);
            linkUrlWrap.hidden = linkTargetSel.value !== 'url';
            panel.appendChild(linkUrlWrap);
            linkTargetSel.addEventListener('change', () => { linkUrlWrap.hidden = linkTargetSel.value !== 'url'; });

            // ---- Erledigte Karten aufraeumen ----
            panel.appendChild(el('label', null, t('cleanup.title')));
            const cl = editBoard.cleanup || { mode: 'off', days: 90, count: 100 };
            const cleanupRow = el('div', 'row');
            cleanupModeSel = document.createElement('select');
            for (const [val, key] of [['off', 'cleanup.off'], ['age', 'cleanup.age'], ['count', 'cleanup.count']]) {
                const o = document.createElement('option'); o.value = val; o.textContent = t(key); cleanupModeSel.appendChild(o);
            }
            cleanupModeSel.value = cl.mode || 'off';
            const daysWrap = el('label', 'inline-num', t('cleanup.days'));
            cleanupDaysInp = document.createElement('input');
            cleanupDaysInp.type = 'number'; cleanupDaysInp.min = '1'; cleanupDaysInp.value = String(cl.days || 90);
            daysWrap.appendChild(cleanupDaysInp);
            const countWrap = el('label', 'inline-num', t('cleanup.countLabel'));
            cleanupCountInp = document.createElement('input');
            cleanupCountInp.type = 'number'; cleanupCountInp.min = '1'; cleanupCountInp.value = String(cl.count || 100);
            countWrap.appendChild(cleanupCountInp);
            cleanupRow.append(cleanupModeSel, daysWrap, countWrap);
            panel.appendChild(cleanupRow);
            panel.appendChild(el('div', 'hint', t('cleanup.hint')));
            const syncCleanupUI = () => {
                daysWrap.hidden = cleanupModeSel.value !== 'age';
                countWrap.hidden = cleanupModeSel.value !== 'count';
            };
            cleanupModeSel.addEventListener('change', syncCleanupUI);
            syncCleanupUI();

            // ---- Papierkorb einblenden (pro Geraet, keine Board-Aenderung) ----
            const trashLbl = el('label', 'inline');
            const trashChk = document.createElement('input');
            trashChk.type = 'checkbox'; trashChk.checked = !!state.showTrash;
            trashChk.dataset.noDirty = '1';   // reine Geraete-Einstellung
            trashChk.addEventListener('change', () => actions.toggleShowTrash());
            trashLbl.append(trashChk, document.createTextNode(' ' + t('trash.showToggle')));
            panel.appendChild(trashLbl);

            // ---- Board loeschen (ganz unten) ----
            const delBoard = el('button', 'danger', t('boards.deleteBoard'));
            delBoard.type = 'button';
            delBoard.style.marginTop = '18px';
            delBoard.addEventListener('click', async () => {
                if (state.boards.length < 2) {
                    await confirmDialog({ title: t('boards.deleteBoard'), message: t('boards.lastBoard'), ok: t('confirm.ok') });
                    return;
                }
                if (!await confirmDialog({ title: t('boards.deleteBoard'), message: t('confirm.deleteBoard', { title: editBoard.title }), danger: true, ok: t('boards.deleteBoard') })) return;
                await actions.deleteBoard(editBoard.id);
                dirty = false;
                editId = (state.board && state.board.id) || (state.boards[0] && state.boards[0].id) || '';
                if (!editId) { bdlg.close(); return; }
                await loadEdit(editId);
                buildBoardPanel(boardPanel);
                validateMembers();
            });
            panel.appendChild(delBoard);

            // Aenderungen an Board-Feldern merken. Ausgenommen sind Bedienelemente,
            // die nichts am Board aendern (Board-Auswahl, Neu-Feld, Geraete-Einstellungen).
            const touch = (ev) => {
                const el2 = ev.target;
                if (el2 && el2.dataset && el2.dataset.noDirty) return;
                dirty = true;
            };
            panel.addEventListener('input', touch);
            panel.addEventListener('change', touch);
        }

        // ---- Tab: Board ----
        await loadEdit(editId);
        addTab('board', t('settings.tabBoard'), panel => { boardPanel = panel; buildBoardPanel(panel); });

        // ---- Tab: Benutzer (Avatare/Farben) ----
        if ((state.users || []).length) {
            addTab('users', t('settings.tabUsers'), panel => {
                panel.appendChild(el('label', null, t('boards.avatars')));
                for (const u of state.users) {
                    const row = el('div', 'avatar-edit');
                    const prev = el('span', 'avatar avatar-prev');
                    const paint = () => {
                        prev.textContent = ''; prev.style.background = '';
                        if (u.avatar) {
                            const im = document.createElement('img');
                            im.src = `avatars/${encodeURIComponent(u.name)}?v=${state.avatarVer || 0}`;
                            prev.appendChild(im);
                        } else {
                            prev.textContent = initials(u.displayName || u.name);
                            prev.style.background = u.color || '#888';
                        }
                    };
                    paint();
                    const nm = el('span', 'avatar-name', u.displayName || u.name);
                    const pick = el('button', 'linkbtn', t('avatar.choose')); pick.type = 'button';
                    const file = document.createElement('input');
                    file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
                    pick.addEventListener('click', () => file.click());
                    file.addEventListener('change', async () => {
                        if (!file.files || !file.files[0]) return;
                        try {
                            const dataUrl = await fileToSquareDataUrl(file.files[0], 128);
                            await api(`api/users/${encodeURIComponent(u.name)}/avatar`, { method: 'POST', body: { image: dataUrl } });
                            u.avatar = true; await actions.avatarsChanged(); paint(); rm.hidden = false;
                        } catch (e) { alert(t('avatar.failed', { msg: e.message })); }
                        file.value = '';
                    });
                    const rm = el('button', 'rm', '×'); rm.type = 'button'; rm.title = t('avatar.remove');
                    rm.hidden = !u.avatar;
                    rm.addEventListener('click', async () => {
                        await api(`api/users/${encodeURIComponent(u.name)}/avatar`, { method: 'DELETE' });
                        u.avatar = false; await actions.avatarsChanged(); paint(); rm.hidden = true;
                    });
                    let colorTimer = null;
                    const colorTrig = makeColorTrigger(u.color || '#7E57C2', (col) => {
                        u.color = col;
                        clearTimeout(colorTimer);
                        colorTimer = setTimeout(async () => {
                            try {
                                await api(`api/users/${encodeURIComponent(u.name)}`, { method: 'PATCH', body: { color: col } });
                                await actions.avatarsChanged();
                            } catch (e) { alert(t('avatar.failed', { msg: e.message })); }
                        }, 500);
                    });
                    colorTrig.title = t('user.color');
                    row.append(prev, nm, colorTrig, pick, file, rm);
                    panel.appendChild(row);
                }
            });
        }

        // ---- Fester Footer: Schliessen + Speichern ----
        const foot = el('footer');
        foot.appendChild(el('span', 'spacer'));
        const closeBtn = el('button', null, t('boards.close'));
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', async () => { if (await guardUnsaved()) bdlg.close(); });
        foot.appendChild(closeBtn);
        saveBtn = el('button', 'primary', t('boards.save'));
        saveBtn.type = 'button';
        saveBtn.addEventListener('click', async () => { if (await saveEdit()) bdlg.close(); });
        foot.appendChild(saveBtn);
        body.appendChild(foot);
        validateMembers();

        activate('board');
        bdlg.showModal();
    }
    // ---------------------------------------------------------- Ansicht teilen
    async function openShareDialog() {
        const sdlg = document.getElementById('shareDialog');
        const body = document.getElementById('shareBody');
        body.textContent = '';
        body.appendChild(el('h3', null, t('share.title')));
        body.appendChild(el('p', 'hint', t('share.hint')));

        const opt = {
            board: (state.board && state.board.id) || (state.boards[0] && state.boards[0].id) || '',
            users: [], labels: [], columns: null, doneLimit: null,
            hideSettings: false, embed: false,
        };

        const mkCheck = (text) => {
            const lab = el('label', 'inline');
            const inp = document.createElement('input'); inp.type = 'checkbox';
            lab.append(inp, document.createTextNode(' ' + text));
            return { lab, inp };
        };

        const board = (() => {
            const lab = el('label', null, t('share.board'));
            const sel = document.createElement('select');
            for (const b of state.boards) { const o = document.createElement('option'); o.value = b.id; o.textContent = b.title; sel.appendChild(o); }
            sel.value = opt.board;
            lab.appendChild(sel);
            return { lab, sel };
        })();

        // Benutzer (Mehrfachauswahl) – keine angehakt = alle
        const usersLabel = el('label', null, t('share.users'));
        const usersWrap = el('div', 'share-cols');
        const updateUsers = () => { opt.users = [...usersWrap.querySelectorAll('input:checked')].map(i => i.dataset.val); };
        for (const u of boardUsers(state)) {
            const chk = mkCheck(u.displayName);
            chk.inp.dataset.val = u.name;
            chk.inp.addEventListener('change', () => { updateUsers(); update(); });
            usersWrap.appendChild(chk.lab);
        }

        // Labels (Mehrfachauswahl, board-abhängig) – keine angehakt = alle
        const labelsLabel = el('label', null, t('share.labels'));
        const labelsWrap = el('div', 'share-cols');
        const updateLabels = () => { opt.labels = [...labelsWrap.querySelectorAll('input:checked')].map(i => i.dataset.val); };
        async function fillLabels(boardId) {
            labelsWrap.textContent = '';
            let labels = [];
            if (state.board && state.board.id === boardId) labels = state.board.labels || [];
            else if (boardId) { try { const b = await api(`api/boards/${encodeURIComponent(boardId)}`); labels = (b && b.labels) || []; } catch (e) { /* ignore */ } }
            for (const l of labels) {
                const chk = mkCheck(l.title);
                chk.inp.dataset.val = l.id;
                chk.inp.addEventListener('change', () => { updateLabels(); update(); });
                labelsWrap.appendChild(chk.lab);
            }
            opt.labels = [];
        }

        const cHideSettings = mkCheck(t('share.hideSettings'));
        const cEmbed = mkCheck(t('share.embed'));

        // Sichtbare Spalten (des gewählten Boards) – alle an = kein Filter
        let curColumns = [];
        const colsLabel = el('label', null, t('share.visibleColumns'));
        const colsWrap = el('div', 'share-cols');
        const updateColumns = () => {
            const checked = [...colsWrap.querySelectorAll('input:checked')].map(i => i.dataset.colId);
            opt.columns = (checked.length === curColumns.length) ? null : checked;
        };
        async function fillColumns(boardId) {
            colsWrap.textContent = '';
            curColumns = [];
            if (state.board && state.board.id === boardId) curColumns = state.board.columns || [];
            else if (boardId) { try { const b = await api(`api/boards/${encodeURIComponent(boardId)}`); curColumns = (b && b.columns) || []; } catch (e) { /* ignore */ } }
            curColumns = curColumns.filter(c => !c.isTrash);
            for (const c of curColumns) {
                const chk = mkCheck(c.title);
                chk.inp.checked = true;
                chk.inp.dataset.colId = c.id;
                chk.inp.addEventListener('change', () => { updateColumns(); update(); });
                colsWrap.appendChild(chk.lab);
            }
            opt.columns = null;
        }

        // Limit für erledigte Karten in Erledigt-Spalten
        const doneLimitLbl = el('label', null, t('share.doneLimit'));
        const doneLimitInp = document.createElement('input');
        doneLimitInp.type = 'number'; doneLimitInp.min = '0'; doneLimitInp.value = ''; doneLimitInp.placeholder = t('share.doneLimitAll');
        doneLimitLbl.appendChild(doneLimitInp);

        const urlWrap = el('div', 'share-url');
        const urlField = document.createElement('input');
        urlField.type = 'text'; urlField.readOnly = true; urlField.className = 'share-url-input';
        const copyBtn = el('button', 'primary', t('share.copy')); copyBtn.type = 'button';
        urlWrap.append(urlField, copyBtn);

        const buildUrl = () => {
            const p = new URLSearchParams();
            if (opt.board) p.set('board', opt.board);
            if (opt.users.length) p.set('users', opt.users.join(','));
            if (opt.labels.length) p.set('label', opt.labels.join(','));
            if (opt.columns && opt.columns.length) p.set('columns', opt.columns.join(','));
            if (opt.doneLimit != null) p.set('doneLimit', String(opt.doneLimit));
            if (opt.hideSettings) p.set('hideSettings', '1');
            if (opt.embed) p.set('embed', '1');
            const q = p.toString();
            return location.origin + location.pathname + (q ? '?' + q : '');
        };
        const update = () => { urlField.value = buildUrl(); };

        board.sel.addEventListener('change', async () => { opt.board = board.sel.value; await Promise.all([fillLabels(opt.board), fillColumns(opt.board)]); update(); });
        doneLimitInp.addEventListener('input', () => { opt.doneLimit = doneLimitInp.value === '' ? null : Math.max(0, parseInt(doneLimitInp.value, 10) || 0); update(); });
        cHideSettings.inp.addEventListener('change', () => { opt.hideSettings = cHideSettings.inp.checked; update(); });
        cEmbed.inp.addEventListener('change', () => { opt.embed = cEmbed.inp.checked; update(); });
        copyBtn.addEventListener('click', async () => {
            const done = () => { copyBtn.textContent = t('share.copied'); setTimeout(() => { copyBtn.textContent = t('share.copy'); }, 1500); };
            try { await navigator.clipboard.writeText(urlField.value); done(); }
            catch (e) { urlField.select(); try { document.execCommand('copy'); } catch (_) { /* ignore */ } done(); }
        });

        body.append(board.lab, usersLabel, usersWrap, labelsLabel, labelsWrap, colsLabel, colsWrap, doneLimitLbl,
            cHideSettings.lab, cEmbed.lab,
            el('label', null, t('share.generatedUrl')), urlWrap);

        const foot = el('footer');
        const close = el('button', null, t('boards.close')); close.type = 'button';
        close.addEventListener('click', () => sdlg.close());
        foot.append(el('span', 'spacer'), close);
        body.appendChild(foot);

        await Promise.all([fillLabels(opt.board), fillColumns(opt.board)]);
        update();
        sdlg.showModal();
    }

    // ---------------------------------------------------------- In-App-Bestätigung (Feature 61)
    function confirmDialog(opts = {}) {
        const cdlg = document.getElementById('confirmDialog');
        const body = document.getElementById('confirmBody');
        body.textContent = '';
        body.appendChild(el('h3', null, opts.title || t('confirm.title')));
        body.appendChild(el('p', null, opts.message || ''));
        const foot = el('footer');
        const cancel = el('button', null, opts.cancel || t('confirm.cancel')); cancel.type = 'button';
        const ok = el('button', opts.danger ? 'danger' : 'primary', opts.ok || t('confirm.ok')); ok.type = 'button';
        // Optionaler dritter Knopf (z.B. „Verwerfen") → löst mit 'extra' auf
        let extraBtn = null;
        if (opts.extra) { extraBtn = el('button', null, opts.extra); extraBtn.type = 'button'; }
        foot.append(el('span', 'spacer'), cancel);
        if (extraBtn) foot.appendChild(extraBtn);
        foot.appendChild(ok);
        body.appendChild(foot);
        return new Promise(resolve => {
            let done = false;
            const finish = v => { if (done) return; done = true; try { cdlg.close(); } catch (e) { /* ignore */ } resolve(v); };
            cancel.addEventListener('click', () => finish(false));
            if (extraBtn) extraBtn.addEventListener('click', () => finish('extra'));
            ok.addEventListener('click', () => finish(true));
            cdlg.addEventListener('close', () => finish(false), { once: true });
            cdlg.showModal();
        });
    }

    // ---------------------------------------------------------- Karte übertragen (Feature 6)
    async function openTransfer(cardId) {
        const card = state.board && state.board.cards.find(c => c.id === cardId);
        if (!card) return;
        const tdlg = document.getElementById('transferDialog');
        const body = document.getElementById('transferBody');
        body.textContent = '';
        body.appendChild(el('h3', null, t('transfer.title')));
        const others = state.boards.filter(b => b.id !== state.board.id);
        const foot = el('footer');
        const cancel = el('button', null, t('boards.close')); cancel.type = 'button';
        cancel.addEventListener('click', () => tdlg.close());

        // Klonen (im selben Board), Kopieren oder Verschieben (auf ein anderes Board)
        let mode = 'clone';
        let targetBoard = null;
        const overrideSel = new Set();
        const labelName = l => String((l && (l.title || l.name)) || '').trim().toLowerCase();

        const modeWrap = el('div', 'transfer-mode');
        const mkMode = (val, label) => {
            const b = el('button', 'transfer-mode-btn' + (val === mode ? ' active' : ''), label);
            b.type = 'button'; b.dataset.mode = val; b.title = label;
            if (val !== 'clone' && !others.length) { b.disabled = true; b.title = t('transfer.noOtherBoards'); }
            b.addEventListener('click', () => setMode(val));
            return b;
        };
        modeWrap.append(mkMode('clone', t('transfer.clone')), mkMode('copy', t('transfer.copy')), mkMode('move', t('transfer.move')));

        const boardLbl = el('label', null, t('transfer.targetBoard'));
        const boardSel = document.createElement('select');
        for (const b of others) { const o = document.createElement('option'); o.value = b.id; o.textContent = b.title; boardSel.appendChild(o); }
        boardLbl.appendChild(boardSel);

        const colLbl = el('label', null, t('transfer.targetColumn'));
        const colSel = document.createElement('select');
        colLbl.appendChild(colSel);

        const note = el('div', 'transfer-note'); note.hidden = true;
        const assignLbl = el('label', null, t('transfer.pickAssignee')); assignLbl.hidden = true;
        const assignWrap = el('div', 'share-cols'); assignWrap.hidden = true;
        const ok = el('button', 'primary', t('transfer.clone')); ok.type = 'button';

        function updateOk() { ok.disabled = !assignLbl.hidden && overrideSel.size === 0; }
        // Modus wechseln: Ziel-Board nur bei Kopieren/Verschieben, Klonen bleibt im Board
        function setMode(val) {
            mode = val;
            for (const x of modeWrap.children) x.classList.toggle('active', x.dataset.mode === mode);
            const clone = mode === 'clone';
            boardLbl.hidden = clone;
            ok.textContent = clone ? t('transfer.clone') : (mode === 'copy' ? t('transfer.copy') : t('transfer.move'));
            if (clone) { targetBoard = state.board; recompute(); } else loadTarget(boardSel.value);
        }
        function recompute() {
            if (!targetBoard) return;
            const clone = mode === 'clone';
            colSel.textContent = '';
            const cols = (targetBoard.columns || []).filter(c => !c.isTrash);
            for (const c of cols) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.title; colSel.appendChild(o); }
            const def = (clone && cols.find(c => c.id === card.columnId)) || cols.find(c => c.allowAdd) || cols[0];
            if (def) colSel.value = def.id;
            if (clone) {
                note.textContent = t('transfer.cloneHint');
                note.hidden = false;
                assignLbl.hidden = true; assignWrap.hidden = true;
                overrideSel.clear();
                updateOk();
                return;
            }
            const fromById = new Map((state.board.labels || []).map(l => [l.id, l]));
            const toNames = new Set((targetBoard.labels || []).map(labelName));
            const droppedLabels = (card.labels || []).filter(id => { const n = labelName(fromById.get(id)); return !(n && toNames.has(n)); });
            const members = new Set(targetBoard.members || []);
            const keptAssignees = (card.assignees || []).filter(a => members.has(a));
            const droppedAssignees = (card.assignees || []).filter(a => !members.has(a));
            const parts = [];
            if (droppedLabels.length) parts.push(t('transfer.dropLabels', { n: droppedLabels.length }));
            if (droppedAssignees.length) parts.push(t('transfer.dropAssignees', { n: droppedAssignees.length }));
            note.textContent = parts.join(' ');
            note.hidden = !parts.length;
            const needPick = keptAssignees.length === 0;
            assignLbl.hidden = !needPick; assignWrap.hidden = !needPick;
            overrideSel.clear();
            if (needPick) {
                assignWrap.textContent = '';
                for (const u of (state.users || []).filter(x => members.has(x.name))) {
                    const lab = el('label', 'inline');
                    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.dataset.val = u.name;
                    inp.addEventListener('change', () => { if (inp.checked) overrideSel.add(u.name); else overrideSel.delete(u.name); updateOk(); });
                    lab.append(inp, document.createTextNode(' ' + (u.displayName || u.name)));
                    assignWrap.appendChild(lab);
                }
            }
            updateOk();
        }
        async function loadTarget(id) {
            try { targetBoard = await api(`api/boards/${encodeURIComponent(id)}`); } catch (e) { targetBoard = null; }
            recompute();
        }
        boardSel.addEventListener('change', () => loadTarget(boardSel.value));
        ok.addEventListener('click', async () => {
            try {
                const toBoard = mode === 'clone' ? state.board.id : boardSel.value;
                await actions.transferCard(cardId, toBoard, colSel.value, mode === 'move' ? 'move' : 'copy', [...overrideSel]);
                tdlg.close();
                dlg.close();
            } catch (e) { alert(t('error.saveFailed', { msg: e.message })); }
        });

        body.append(modeWrap, boardLbl, colLbl, note, assignLbl, assignWrap);
        foot.append(el('span', 'spacer'), cancel, ok);
        body.appendChild(foot);
        if (others.length) boardSel.value = others[0].id;
        setMode('clone');
        tdlg.showModal();
    }

    return { openCard, copyCard, openDescription, openBoardManager, openShareDialog, confirm: confirmDialog };
}
