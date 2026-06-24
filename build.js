const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DIST = path.join(__dirname, 'dist');

const FILES = [
    'background.js', 'content.js', 'passport-parser.js', 'i18n.js',
    'popup.html', 'popup.js', 'style.css',
    'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/utils.js', 'lib/tesseract.min.js',
    'icons/icon.png', 'icons/icon16.png', 'icons/icon48.png'
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

    // Firefox MV3 differences:
    // 1. background.scripts instead of background.service_worker
    manifest.background = { scripts: ['lib/utils.js', 'i18n.js', 'passport-parser.js', 'background.js'] };

    // 2. Remove webNavigation (not available in Firefox MV3)
    manifest.permissions = manifest.permissions.filter(p => p !== 'webNavigation');

    // 3. optional_host_permissions -> not supported in Firefox, use optional_permissions
    if (manifest.optional_host_permissions) {
        manifest.optional_permissions = manifest.optional_host_permissions;
        delete manifest.optional_host_permissions;
    }

    // 4. web_accessible_resources — Firefox uses different format
    // MV3 format with matches works in Firefox 109+
    // Keep as is

    // 5. browser_specific_settings already in manifest — keep it
    // gecko id and strict_min_version

    // 6. Commands work in Firefox
    // Keep commands

    fs.writeFileSync(
        path.join(out, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    FILES.forEach(f => {
        const src = path.join(SRC, f);
        if (fs.existsSync(src)) copyFile(src, path.join(out, f));
    });

    // Firefox needs background scripts loaded in order — create a loader
    const loader = `// Firefox background script loader
// Firefox MV3 uses background.scripts instead of service_worker
// Load order: utils -> i18n -> passport-parser -> background
`;
    fs.writeFileSync(path.join(out, 'background-loader.js'), loader);

    console.log('Firefox build: ' + out);
}

const target = process.argv[2];
if (target === 'chrome') buildChrome();
else if (target === 'firefox') buildFirefox();
else { buildChrome(); buildFirefox(); }

console.log('Done.');