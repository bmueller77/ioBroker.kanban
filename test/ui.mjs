import assert from 'node:assert/strict';
import {
    absoluteOrder, boardMembers, countDues, dueState, getCountModes, totalLabel, plainText, shortUrl,
    contrastRatio, focusRingColor, contrastText,
} from '../www/js/board.js';

/**
 * Reine Hilfsfunktionen der Oberfläche — ohne Browser prüfbar.
 * Beide gehören zu Befunden, die nur unter Filtern bzw. bei fremden Boards auftraten.
 */

/** Karte im Board-State */
const card = (id, order, columnId = 'todo') => ({ id, order, columnId });
/** Nachgebaute DOM-Liste: SortableJS liefert die Karte bereits einsortiert. */
const list = (...ids) => ({ children: ids.map(id => ({ dataset: { cardId: id } })) });

describe('Drag & Drop: sichtbarer Index in die volle Spaltenordnung', () => {
    // Spalte mit fünf Karten, von denen ein Filter nur a, c und e zeigt
    const board = {
        cards: [card('a', 0), card('b', 1), card('c', 2), card('d', 3), card('e', 4)],
    };

    it('ordnet vor die nächste sichtbare Karte ein', () => {
        // gezogen wird 'e', abgelegt zwischen den sichtbaren 'a' und 'c'
        const dom = list('a', 'e', 'c');
        // Ohne Umrechnung würde 1 gesendet und 'e' landete zwischen a und b.
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 1), 2);
    });

    it('ordnet hinter die vorherige sichtbare Karte ein, wenn keine folgt', () => {
        const dom = list('a', 'c', 'e');
        // 'e' hinter 'c': in der vollen Liste (ohne e) steht c an Position 2
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 2), 3);
    });

    it('legt ganz oben ab, wenn die Karte vor allem Sichtbaren landet', () => {
        const dom = list('e', 'a', 'c');
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 0), 0);
    });

    it('bleibt ohne Filter beim gewohnten Ergebnis', () => {
        const dom = list('a', 'b', 'e', 'c', 'd');
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 2), 2);
        assert.equal(absoluteOrder(board, 'todo', 'e', list('e', 'a', 'b', 'c', 'd'), 0), 0);
        assert.equal(absoluteOrder(board, 'todo', 'e', list('a', 'b', 'c', 'd', 'e'), 4), 4);
    });

    it('kommt mit einer leeren Zielspalte zurecht', () => {
        assert.equal(absoluteOrder(board, 'leer', 'e', list('e'), 0), 0);
    });

    it('ignoriert Fremdelemente in der Liste, etwa den Hinweis „+X weitere"', () => {
        const dom = { children: [{ dataset: { cardId: 'a' } }, { dataset: {} }, { dataset: { cardId: 'e' } }] };
        assert.equal(absoluteOrder(board, 'todo', 'e', dom, 1), 1);
    });
});

describe('Wirksame Board-Mitglieder', () => {
    const users = [{ name: 'anna' }, { name: 'ben' }, { name: 'carla' }];

    it('nimmt die genannten Mitglieder', () => {
        assert.deepEqual(boardMembers({ members: ['anna', 'carla'] }, users), ['anna', 'carla']);
    });

    it('behandelt eine leere Liste als alle', () => {
        assert.deepEqual(boardMembers({ members: [] }, users), ['anna', 'ben', 'carla']);
        assert.deepEqual(boardMembers({}, users), ['anna', 'ben', 'carla']);
    });

    it('behandelt eine ins Leere zeigende Liste als alle', () => {
        // Regression: Der Übertragen-Dialog las die Liste roh — ein per API
        // angelegtes Board galt damit als „niemand zuweisbar" und der Dialog
        // ließ sich nicht mehr bestätigen.
        assert.deepEqual(boardMembers({ members: ['umbenannt'] }, users), ['anna', 'ben', 'carla']);
    });

    it('lässt unbekannte Namen aus einer sonst gültigen Liste weg', () => {
        assert.deepEqual(boardMembers({ members: ['anna', 'weg'] }, users), ['anna']);
    });
});

/**
 * Datum als YYYY-MM-DD, um n Tage verschoben.
 *
 * @param n Verschiebung in Tagen
 * @returns Datum als Zeichenkette
 */
function tag(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Fälligkeit: dreistufige Einfärbung', () => {
    // Vorgabe der Instanz: einen Tag vorher erinnern
    const cfg = { reminderDaysBefore: 1 };

    it('färbt Vergangenes als überfällig', () => {
        assert.equal(dueState(tag(-1), '', cfg), 'overdue');
    });

    it('trennt heute von morgen', () => {
        // Genau der Punkt aus dem Forum: beides war vorher orange
        assert.equal(dueState(tag(0), '', cfg), 'today');
        assert.equal(dueState(tag(1), '', cfg), 'soon');
    });

    it('lässt später Fälliges ungefärbt', () => {
        assert.equal(dueState(tag(2), '', cfg), '');
    });

    it('lässt sich von der Vorlaufzeit nicht mehr verschieben', () => {
        // C12: Gelb heisst der nächste Kalendertag, sonst nichts. Vorher zog
        // die Vorlaufzeit die Farbe mit, und bei 3 war alles bis übermorgen
        // gelb, während die Zahl darüber "Morgen" hiess. Die Vorlaufzeit
        // steuert seither nur noch die Erinnerungsmail.
        for (const vorlauf of [0, 1, 3, 7]) {
            assert.equal(dueState(tag(1), '', { reminderDaysBefore: vorlauf }), 'soon');
            assert.equal(dueState(tag(2), '', { reminderDaysBefore: vorlauf }), '');
            assert.equal(dueState(tag(3), '', { reminderDaysBefore: vorlauf }), '');
        }
    });

    it('kommt ohne Konfiguration zurecht', () => {
        assert.equal(dueState(tag(1), '', {}), 'soon');
        assert.equal(dueState(tag(1), '', undefined), 'soon');
    });

    it('zählt die Uhrzeit, sobald sie verstrichen ist', () => {
        // Eine Karte, die heute um 00:01 fällig war, ist mittags vorbei
        assert.equal(dueState(tag(0), '00:01', cfg), 'overdue');
        // Eine um 23:59 noch nicht
        assert.equal(dueState(tag(0), '23:59', cfg), 'today');
    });

    it('ignoriert eine unbrauchbare Uhrzeit, statt zu raten', () => {
        assert.equal(dueState(tag(0), 'kaputt', cfg), 'today');
    });

    it('gibt für Karten ohne Datum nichts zurück', () => {
        assert.equal(dueState('', '', cfg), '');
    });
});

describe('Kopfzahlen der Spalten', () => {
    const cfg = { reminderDaysBefore: 1 };
    const board = { id: 'familie' };
    const col = { id: 'todo' };

    it('zählt je Fälligkeitsstufe', () => {
        const liste = [`${tag(-3)}|`, `${tag(-1)}|`, `${tag(0)}|`, `${tag(1)}|`, `${tag(9)}|`];
        assert.deepEqual(countDues(liste, cfg), { soon: 1, today: 1, overdue: 2 });
    });

    it('lässt später Fälliges aus jeder Stufe heraus', () => {
        assert.deepEqual(countDues([`${tag(5)}|`, `${tag(30)}|`], cfg), { soon: 0, today: 0, overdue: 0 });
    });

    it('zählt unter "Morgen" nur den nächsten Kalendertag', () => {
        // Gegenprobe zu C12, diesmal an der Kopfzahl.
        const liste = [`${tag(1)}|`, `${tag(2)}|`, `${tag(3)}|`];
        assert.equal(countDues(liste, { reminderDaysBefore: 3 }).soon, 1);
        assert.equal(countDues(liste, cfg).soon, 1);
    });

    it('wertet die Uhrzeit mit aus', () => {
        assert.equal(countDues([`${tag(0)}|00:01`], cfg).overdue, 1);
        assert.equal(countDues([`${tag(0)}|23:59`], cfg).today, 1);
    });

    it('stolpert nicht über leere Einträge', () => {
        // Ohne fällige Karte steht im data-Attribut ein leerer String, den
        // split(',') zu [''] macht.
        assert.deepEqual(countDues([''], cfg), { soon: 0, today: 0, overdue: 0 });
    });

    it('zeigt ohne Einstellung nur die Gesamtzahl', () => {
        assert.deepEqual(getCountModes({}, board, col), ['total']);
        assert.deepEqual(getCountModes({ countModes: {} }, board, col), ['total']);
    });

    it('merkt sich die Auswahl je Board und Spalte', () => {
        const state = { countModes: { 'familie:todo': ['total', 'overdue'] } };
        assert.deepEqual(getCountModes(state, board, col), ['total', 'overdue']);
        // andere Spalte, andere Einstellung
        assert.deepEqual(getCountModes(state, board, { id: 'doing' }), ['total']);
    });

    it('bringt die Auswahl in die Reihenfolge der Anzeige', () => {
        const state = { countModes: { 'familie:todo': ['overdue', 'total', 'soon'] } };
        assert.deepEqual(getCountModes(state, board, col), ['total', 'soon', 'overdue']);
    });

    it('fällt bei unbrauchbarem Inhalt auf die Gesamtzahl zurück', () => {
        assert.deepEqual(getCountModes({ countModes: { 'familie:todo': ['quatsch'] } }, board, col), ['total']);
        assert.deepEqual(getCountModes({ countModes: { 'familie:todo': 'total' } }, board, col), ['total']);
    });
});

describe('Gesamtzahl im Spaltenkopf', () => {
    // Die Regel: Die Zahl vor dem Schraegstrich muss zu der Farbe passen, in
    // der sie steht. Zweimal falsch gewesen, deshalb hier festgehalten.
    it('zeigt ohne Limit nur die Zahl', () => {
        assert.equal(totalLabel(7, 7, false, 0), '7');
        assert.equal(totalLabel(7, 2, true, 0), '2');
    });

    it('zeigt bei eingehaltenem Limit Spalte und Limit', () => {
        assert.equal(totalLabel(3, 3, false, 5), '3/5');
        assert.equal(totalLabel(5, 5, false, 5), '5/5');
    });

    it('laesst den Schraegstrich weg, solange gefiltert und eingehalten wird', () => {
        // Sonst stuende dort ein Verhaeltnis aus zwei verschiedenen Mengen.
        assert.equal(totalLabel(3, 1, true, 5), '1');
    });

    it('nennt bei Ueberschreitung die Spalte, nicht die gefilterte Zahl', () => {
        // A20: Die Warnfarbe kommt von allInCol. Eine rote "2/5" erklaert sich
        // niemandem, "7/5" schon.
        assert.equal(totalLabel(7, 2, true, 5), '7/5');
        assert.equal(totalLabel(7, 7, false, 5), '7/5');
        assert.equal(totalLabel(6, 0, true, 5), '6/5');
    });

    it('kommt mit unbrauchbaren Limits zurecht', () => {
        for (const kaputt of [null, undefined, '', 'viele', -3]) {
            assert.equal(totalLabel(4, 4, false, kaputt), '4');
        }
    });
});

describe('Zusammenfassung der zugeklappten Abschnitte', () => {
    // B3: Dort stand der rohe Markdown-Quelltext, also Rauten und Sternchen
    // statt der ersten Zeile des Textes.
    it('nimmt die Auszeichnung aus dem Text', () => {
        assert.equal(plainText('## Ueberschrift'), 'Ueberschrift');
        assert.equal(plainText('Ein **fetter** Text'), 'Ein fetter Text');
        assert.equal(plainText('Ein _kursiver_ Text'), 'Ein kursiver Text');
        assert.equal(plainText('~~weg~~ damit'), 'weg damit');
        assert.equal(plainText('- erster\n- zweiter'), 'erster zweiter');
        assert.equal(plainText('1. eins\n2. zwei'), 'eins zwei');
        assert.equal(plainText('> Zitat'), 'Zitat');
    });

    it('behaelt bei Links den Text und wirft die Adresse weg', () => {
        assert.equal(plainText('siehe [Handbuch](https://example.com/x)'), 'siehe Handbuch');
        assert.equal(plainText('![Bild](a.png) daneben'), 'daneben');
    });

    it('wirft Codebloecke ganz raus und entkleidet Code im Fliesstext', () => {
        assert.equal(plainText('vor ```js\ncode()\n``` nach'), 'vor nach');
        assert.equal(plainText('nimm `npm test`'), 'nimm npm test');
    });

    it('macht eine einzige Zeile daraus', () => {
        assert.equal(plainText('   a \n\n   b   '), 'a b');
        assert.equal(plainText(''), '');
        assert.equal(plainText(null), '');
    });

    it('kuerzt Adressen auf Host und letzten Pfadteil', () => {
        // Nur der Host reichte nicht: zwei Dateien auf demselben Server sahen
        // zugeklappt gleich aus.
        assert.equal(shortUrl('https://example.com/doc/anleitung.pdf'), 'example.com/anleitung.pdf');
        assert.equal(shortUrl('https://example.com/'), 'example.com');
        assert.equal(shortUrl('https://example.com'), 'example.com');
        assert.equal(shortUrl(''), '');
    });

    it('laesst stehen, was keine Adresse ist, und kuerzt sehr lange', () => {
        assert.equal(shortUrl('/pfad/datei.pdf'), '/pfad/datei.pdf');
        const lang = shortUrl(`https://example.com/${'a'.repeat(80)}`);
        assert.equal(lang.length, 43);
        assert.ok(lang.endsWith('...'));
    });
});

describe('Farbe des Fokusrings', () => {
    // G1: Der Ring nahm die Akzentfarbe unveraendert. Im dunklen Theme stand
    // damit ein dunkler Ton gegen dunkle Flaechen, gemessen bis herunter auf
    // 1,52:1. Gefordert sind 3:1.
    const dunkel = ['#16161a', '#232329', '#2d2d35', '#53535c'];
    const hell = ['#f4f4f7', '#ffffff', '#e9e9ee', '#676770'];

    it('rechnet Kontraste nach WCAG', () => {
        assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
        assert.equal(Math.round(contrastRatio('#ffffff', '#ffffff')), 1);
    });

    it('hellt eine dunkle Akzentfarbe auf, bis sie ueberall reicht', () => {
        const ring = focusRingColor('#1B7F4B', dunkel, true);
        for (const f of dunkel) {
            assert.ok(contrastRatio(ring, f) >= 3, `${ring} auf ${f}: ${contrastRatio(ring, f).toFixed(2)}`);
        }
    });

    it('dunkelt eine helle Akzentfarbe ab, bis sie ueberall reicht', () => {
        const ring = focusRingColor('#F9A825', hell, false);
        for (const f of hell) {
            assert.ok(contrastRatio(ring, f) >= 3, `${ring} auf ${f}: ${contrastRatio(ring, f).toFixed(2)}`);
        }
    });

    it('laesst eine Farbe in Ruhe, die schon reicht', () => {
        // Bleibt sie unveraendert, ist die Farbfamilie der Instanz erhalten.
        const ring = focusRingColor('#7E57C2', ['#ffffff'], false);
        assert.equal(ring.toLowerCase(), '#7e57c2');
    });

    it('faellt bei unbrauchbaren Eingaben auf Schwarz oder Weiss zurueck', () => {
        assert.equal(focusRingColor('', dunkel, true), '#ffffff');
        assert.equal(focusRingColor('#1B7F4B', [], false), '#000000');
        assert.equal(focusRingColor('kaputt', hell, false), '#000000');
    });
});

describe('Schrift auf einer Farbflaeche', () => {
    // G5: Eine feste Helligkeitsschwelle von 0,31 traf die Wahl zwischen
    // Schwarz und Weiss systematisch falsch. Der Umschlagpunkt liegt bei 0,179.
    const paare = [
        ['#26A69A', '#000'],   // Tuerkis: Schwarz 7,0:1 gegen Weiss 3,0:1
        ['#E91E63', '#000'],   // Pink: knapp, Schwarz 4,83:1 gegen Weiss 4,35:1
        ['#7E57C2', '#fff'],
        ['#FF9800', '#000'],
        ['#4CAF50', '#000'],
        ['#000000', '#fff'],
        ['#ffffff', '#000'],
    ];

    it('waehlt jeweils die besser lesbare der beiden', () => {
        for (const [grund, erwartet] of paare) {
            const gewaehlt = contrastText(grund);
            const andere = gewaehlt === '#fff' ? '#000' : '#fff';
            assert.ok(
                contrastRatio(gewaehlt, grund) >= contrastRatio(andere, grund),
                `${grund}: ${gewaehlt} ${contrastRatio(gewaehlt, grund).toFixed(2)} gegen ` +
                `${andere} ${contrastRatio(andere, grund).toFixed(2)}`,
            );
            assert.equal(gewaehlt, erwartet, `${grund}`);
        }
    });

    it('nimmt bei unbrauchbaren Werten Weiss', () => {
        for (const v of ['', null, 'kaputt']) {
            assert.equal(contrastText(v), '#fff');
        }
    });
});
