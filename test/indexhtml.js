'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Bis app.js geladen ist, sieht man die statischen Texte der Startseite. Greift
// eine Uebersetzung nicht, bleiben sie stehen. Beides verlangt Englisch.
const HTML = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const EN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'www', 'i18n', 'en.json'), 'utf8'));

function entschluesseln(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

const ohneKommentare = HTML.replace(/<!--[\s\S]*?-->/g, '');

describe('Startseite: englische Platzhalter', () => {
    it('erklaert sich als englisch', () => {
        assert.match(HTML, /<html lang="en"/);
    });

    it('zeigt vor der Uebersetzung die englischen Texte aus en.json', () => {
        const re = /data-i18n="([^"]+)"[^>]*>([^<]*)/g;
        const falsch = [];
        let m;
        let n = 0;
        while ((m = re.exec(ohneKommentare))) {
            n++;
            const [, key, text] = m;
            assert.ok(key in EN, `Schluessel ${key} fehlt in en.json`);
            if (entschluesseln(text.trim()) !== EN[key]) {
                falsch.push(`${key}: "${text.trim()}" statt "${EN[key]}"`);
            }
        }
        assert.ok(n > 40, `nur ${n} Platzhalter gefunden, das Suchmuster passt nicht mehr`);
        assert.deepEqual(falsch, []);
    });

    it('hat englische title- und placeholder-Werte, wo welche statisch stehen', () => {
        const falsch = [];
        for (const [marke, attr] of [
            ['data-i18n-title', 'title'],
            ['data-i18n-ph', 'placeholder'],
        ]) {
            const re = new RegExp(`<[^>]*${marke}="([^"]+)"[^>]*>`, 'g');
            let m;
            while ((m = re.exec(ohneKommentare))) {
                const wert = new RegExp(`\\s${attr}="([^"]*)"`).exec(m[0]);
                if (wert && entschluesseln(wert[1]) !== EN[m[1]]) {
                    falsch.push(`${m[1]}: "${wert[1]}" statt "${EN[m[1]]}"`);
                }
            }
        }
        assert.deepEqual(falsch, []);
    });

    it('enthaelt ausserhalb von Kommentaren keine Umlaute', () => {
        const zeilen = ohneKommentare.split('\n').filter(z => /[äöüÄÖÜß]/.test(z));
        assert.deepEqual(zeilen, []);
    });
});
