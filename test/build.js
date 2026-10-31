'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uiBuildId } = require('../lib/server');

// Die Kennung entscheidet, ob offene Seiten neu laden. Aendert sie sich ohne
// neuen Code, laden alle Tablets bei jedem Neustart; aendert sie sich bei neuem
// Code nicht, bleibt der alte Stand stehen.
describe('Kennung des Oberflaechen-Stands', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-build-'));
        fs.mkdirSync(path.join(dir, 'js'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(dir, 'js', 'app.js'), 'console.log(1);');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('bleibt bei gleichem Inhalt gleich', () => {
        assert.equal(uiBuildId(dir), uiBuildId(dir));
        assert.match(uiBuildId(dir), /^[0-9a-f]{12}$/);
    });

    it('aendert sich, wenn sich eine Datei aendert', () => {
        const vorher = uiBuildId(dir);
        fs.writeFileSync(path.join(dir, 'js', 'app.js'), 'console.log(2);');
        assert.notEqual(uiBuildId(dir), vorher);
    });

    it('aendert sich, wenn eine Datei dazukommt oder umbenannt wird', () => {
        const vorher = uiBuildId(dir);
        fs.renameSync(path.join(dir, 'js', 'app.js'), path.join(dir, 'js', 'main.js'));
        assert.notEqual(uiBuildId(dir), vorher);
    });

    it('haengt nicht am Aenderungsdatum', () => {
        const vorher = uiBuildId(dir);
        const spaeter = new Date(Date.now() + 3600 * 1000);
        fs.utimesSync(path.join(dir, 'index.html'), spaeter, spaeter);
        assert.equal(uiBuildId(dir), vorher);
    });
});
