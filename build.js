const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DIST = path.join(__dirname, 'dist');

const FILES = [
    'background.js', 'content.js', 'passport-parser.js', 'utils.js',
    'popup.html', 'popup.js', 'style.css',
    'pdf.min.js', 'pdf.worker.min.js', 'icon.png'
];

function copyFile(src, dest) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
}

function buildChrome() {
    const out = path.join(DIST, 'chrome');
    if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
    delete manifest.browser_specific_settings;

    fs.writeFileSync(
        path.join(out, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    FILES.forEach(f => {
        const src = path.join(SRC, f);
        if (fs.existsSync(src)) copyFile(src, path.join(out, f));
    });

    console.log('Chrome build: ' + out);
}

function buildFirefox() {
    const out = path.join(DIST, 'firefox');
    if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

    manifest.background = { scripts: ['passport-parser.js', 'background.js'] };

    if (manifest.web_accessible_resources && manifest.web_accessible_resources[0]) {
        manifest.web_accessible_resources[0].matches = ['<all_urls>'];
    }

    if (manifest.commands) {
        delete manifest.commands;
    }

    fs.writeFileSync(
        path.join(out, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    FILES.forEach(f => {
        const src = path.join(SRC, f);
        if (fs.existsSync(src)) copyFile(src, path.join(out, f));
    });

    console.log('Firefox build: ' + out);
}

const target = process.argv[2];
if (target === 'chrome') buildChrome();
else if (target === 'firefox') buildFirefox();
else { buildChrome(); buildFirefox(); }

console.log('Done.');
