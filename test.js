const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  PASS: ' + message); }
    else { failed++; console.error('  FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) { passed++; console.log('  PASS: ' + message); }
    else { failed++; console.error('  FAIL: ' + message + ' (got: ' + JSON.stringify(actual) + ', expected: ' + JSON.stringify(expected) + ')'); }
}

// Load modules
const parserCode = fs.readFileSync(path.join(__dirname, 'passport-parser.js'), 'utf8');
const PassportParser = new Function('self', parserCode + '\nreturn self.PassportParser || PassportParser;')(globalThis);

const i18nCode = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
const I18N = new Function(i18nCode + '\nreturn I18N;')();

// Syntax check all JS files
console.log('\n=== Syntax Check ===');
['content.js', 'popup.js', 'background.js', 'i18n.js', 'passport-parser.js', 'build.js'].forEach(function(file) {
    try {
        new Function(fs.readFileSync(path.join(__dirname, file), 'utf8'));
        passed++;
        console.log('  PASS: ' + file + ' syntax valid');
    } catch(e) {
        failed++;
        console.error('  FAIL: ' + file + ' syntax error: ' + e.message);
    }
});

// manifest.json valid
console.log('\n=== Manifest ===');
try {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    assert(!!manifest, 'manifest.json parses');
    assertEqual(manifest.manifest_version, 3, 'manifest_version is 3');
    assertEqual(manifest.version, '0.7.1', 'version is 0.7.1');
    assert(!!manifest.content_scripts, 'has content_scripts');
    assert(!!manifest.background, 'has background');
    assert(!!manifest.background.scripts, 'source manifest uses Firefox background.scripts');
    assert(!manifest.background.service_worker, 'source manifest has no Firefox-blocked service_worker');
    assert(!!manifest.action, 'has action');
    assert(!!manifest.permissions, 'has permissions');
    assert(manifest.content_scripts[0].js.includes('lib/pdf.min.js'), 'pdf.min.js in content scripts');
    assert(manifest.content_scripts[0].js.includes('i18n.js'), 'i18n.js in content scripts');
    assert(manifest.content_scripts[0].js.includes('passport-parser.js'), 'passport-parser.js in content scripts');
    assert(manifest.content_scripts[0].all_frames === true, 'all_frames is true');
} catch(e) {
    failed++;
    console.error('  FAIL: manifest.json error: ' + e.message);
}

// File existence
console.log('\n=== File Existence ===');
['content.js', 'popup.js', 'background.js', 'i18n.js', 'passport-parser.js', 'style.css', 'popup.html', 'build.js',
 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/utils.js',
 'icons/icon.png', 'icons/icon16.png', 'icons/icon48.png'].forEach(function(file) {
    assert(fs.existsSync(path.join(__dirname, file)), file + ' exists');
});

// IIN validation
console.log('\n=== IIN Validation ===');
assertEqual(PassportParser.validateIIN('800929401181'), true, 'valid IIN 800929401181');
assertEqual(PassportParser.validateIIN('000000000000'), false, 'invalid IIN all zeros');
assertEqual(PassportParser.validateIIN('111111111111'), false, 'invalid IIN all ones');
assertEqual(PassportParser.validateIIN('123456789012'), false, 'invalid IIN random');
assertEqual(PassportParser.validateIIN(''), false, 'empty IIN');
assertEqual(PassportParser.validateIIN(null), false, 'null IIN');
assertEqual(PassportParser.validateIIN('8009294011'), false, 'short IIN (10 digits)');
assertEqual(PassportParser.validateIIN('8009294011811'), false, 'long IIN (13 digits)');

// IIN full validation
console.log('\n=== IIN Full Validation ===');
const fullResult = PassportParser.validateIINFull('800929401181');
assertEqual(fullResult.valid, true, 'IIN full valid');
assertEqual(fullResult.info.birthDate, '29.09.1980', 'IIN birth date');
assertEqual(fullResult.info.gender, '0', 'IIN gender (female)');

const fullResult2 = PassportParser.validateIINFull('850101500012');
if (fullResult2.valid) {
    assertEqual(fullResult2.info.gender, '1', 'IIN gender (male, century 5)');
}

// Passport expiry validation
console.log('\n=== Passport Expiry ===');
const expOk = PassportParser.validatePassportExpiry('26.02.2033', 'TR');
assertEqual(expOk.valid, true, 'passport valid for Turkey');
assert(expOk.monthsValid > 0, 'passport has positive months valid');

const expPast = PassportParser.validatePassportExpiry('01.01.2020', 'TR');
assertEqual(expPast.valid, false, 'expired passport invalid');

const expSoon = PassportParser.validatePassportExpiry('01.01.' + (new Date().getFullYear() + 1), 'TR');
assertEqual(expSoon.valid, true, 'passport valid 1 year for Turkey');

const expGeorgia = PassportParser.validatePassportExpiry('01.01.' + (new Date().getFullYear() + 1), 'GE');
assertEqual(expGeorgia.valid, true, 'passport valid for Georgia (no requirement)');

// MRZ parsing
console.log('\n=== MRZ Parsing ===');
const mrzText = 'P<KAZALINA<<AINUR<<<<<<<<<<<<<<<<<<<<<<<<<<\nN15135160KAZ8009294F3302263<<<<<<<<<<<<<<00';
const mrzData = PassportParser.parseMRZ(mrzText);
if (mrzData) {
    assertEqual(mrzData.surname, 'ALINA', 'MRZ surname');
    assertEqual(mrzData.name, 'AINUR', 'MRZ name');
}

// Full passport text parsing
console.log('\n=== Passport Text Parsing ===');
const sampleText = `P
KAZ
N15135160
ALINA
AINUR
КАЗАХСТАН
29.09.1980
27.02.2023
26.02.2033
MINISTRY OF INTERNAL AFFAIRS
F
800929401181
КАЗАХСТАН
ALINA<<AINUR<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`;

const parsed = PassportParser.parse(sampleText);
assertEqual(parsed.number, 'N15135160', 'parsed passport number');
assertEqual(parsed.surname, 'ALINA', 'parsed surname');
assertEqual(parsed.name, 'AINUR', 'parsed name');
assertEqual(parsed.iin, '800929401181', 'parsed IIN');
assertEqual(parsed.birthDate, '29.09.1980', 'parsed birth date');
assertEqual(parsed.validDate, '26.02.2033', 'parsed valid date');
assertEqual(parsed.gender, '0', 'parsed gender (female)');
assertEqual(parsed.nationality, 'KAZ', 'parsed nationality');
assertEqual(parsed.isValid, true, 'parsed isValid');

// Country rules
console.log('\n=== Country Rules ===');
assert(PassportParser.COUNTRY_RULES['TR'].months === 6, 'Turkey requires 6 months');
assert(PassportParser.COUNTRY_RULES['GE'].months === 0, 'Georgia requires 0 months');
assert(PassportParser.COUNTRY_RULES['EG'].months === 6, 'Egypt requires 6 months');
assert(Object.keys(PassportParser.COUNTRY_RULES).length >= 20, 'at least 20 country rules');

// i18n
console.log('\n=== i18n ===');
assertEqual(typeof I18N, 'object', 'I18N exists');
assertEqual(typeof I18N.ru, 'object', 'I18N.ru exists');
assertEqual(typeof I18N.en, 'object', 'I18N.en exists');
assertEqual(I18N.ru.settings, 'Настройки', 'RU settings key');
assertEqual(I18N.en.settings, 'Settings', 'EN settings key');
assertEqual(I18N.ru.email, 'Эл. почта', 'RU email key');
assertEqual(I18N.en.email, 'Email', 'EN email key');

// Check all RU keys exist in EN
console.log('\n=== i18n Key Parity ===');
let missingKeys = [];
Object.keys(I18N.ru).forEach(function(key) {
    if (!I18N.en[key]) missingKeys.push(key);
});
assertEqual(missingKeys.length, 0, 'all RU keys exist in EN' + (missingKeys.length ? ' (missing: ' + missingKeys.join(', ') + ')' : ''));

// popup.html references
console.log('\n=== popup.html ===');
const popupHtml = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
assert(popupHtml.includes('lib/pdf.min.js'), 'popup.html references lib/pdf.min.js');
assert(popupHtml.includes('i18n.js'), 'popup.html references i18n.js');
assert(popupHtml.includes('passport-parser.js'), 'popup.html references passport-parser.js');
assert(popupHtml.includes('popup.js'), 'popup.html references popup.js');
assert(!popupHtml.includes('onclick='), 'popup.html has no inline onclick (CSP safe)');
assert(!popupHtml.includes('id="importFile"'), 'popup.html does not rely on hidden import input');

// Check no old file paths
console.log('\n=== File Paths ===');
const allJs = ['content.js', 'popup.js', 'background.js'];
allJs.forEach(function(file) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    // Should not reference old paths (without lib/ or icons/)
    const oldPdfRef = code.match(/['"]pdf\.min\.js['"]/);
    const oldWorkerRef = code.match(/['"]pdf\.worker\.min\.js['"]/);
    const oldIconRef = code.match(/['"]icon\.png['"]/);
    assert(!oldPdfRef, file + ' has no old pdf.min.js reference');
    assert(!oldWorkerRef, file + ' has no old pdf.worker.min.js reference');
    assert(!oldIconRef, file + ' has no old icon.png reference');
});

// Check no file.arrayBuffer() calls (Firefox incompatible)
console.log('\n=== Firefox Compatibility ===');
['content.js', 'popup.js'].forEach(function(file) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const hasArrayBuffer = code.includes('.arrayBuffer()') && !code.includes('readFileAsArrayBuffer');
    // Allow .arrayBuffer() only in helper function definitions
    const rawCalls = code.match(/file\.arrayBuffer\(\)/g) || [];
    assert(rawCalls.length === 0, file + ' has no direct file.arrayBuffer() calls');
    const blobUrls = code.match(/URL\.createObjectURL\(file/g) || [];
    assert(blobUrls.length === 0, file + ' has no URL.createObjectURL(file) calls');
    // Check getDocument calls have disableRange (Firefox ReadableStream fix)
    const getDocCalls = code.match(/getDocument\(\{[^}]*\}\)/g) || [];
    getDocCalls.forEach(function(call) {
        assert(call.includes('disableRange'), file + ' getDocument has disableRange: ' + call.substring(0, 60));
    });
});

const contentCode = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
assert(!contentCode.includes('Array.from(new Uint8Array(reader.result))'), 'content.js does not copy PDF bytes into huge arrays');
assert(contentCode.includes("typeof response.text === 'string'"), 'content.js accepts empty background PDF text responses');
assert(!contentCode.includes('pdf.cleanup().then(() => pdf.destroy())'), 'content.js has no unconditional pdf.cleanup() call');
assert(contentCode.includes('parsePdfInBackground(files[i])'), 'content.js uses background PDF parsing for Firefox multi-file flow');
assert(contentCode.includes('globalDropListenersAttached'), 'content.js attaches global drop listeners only once');

const popupCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
assert(!popupCode.includes("file && file.type === 'application/pdf' || file.type.startsWith('image/')"), 'popup.js file type checks are parenthesized');
assert(popupCode.includes('document.head.appendChild(script);\n                    await scriptLoaded;'), 'popup.js waits for dynamic script after appending it');
assert(popupCode.includes("input.addEventListener('change', handleImportFile, { once: true })"), 'popup.js creates a fresh import file input');
assert(popupCode.includes('chrome.storage.local.set(data'), 'popup.js imports settings directly into local storage');
assert(!popupCode.includes("action: 'importSettings', settings"), 'popup.js import does not depend on background round-trip');

const backgroundCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
assert(backgroundCode.includes('function extractPdfText(pdf)'), 'background.js extracts PDF text through helper');
assert(backgroundCode.includes('Math.min(pdf.numPages || 1, 3)'), 'background.js caps PDF pages parsed in background');

// Check tesseract.min.js exists locally
assert(fs.existsSync(path.join(__dirname, 'lib/tesseract.min.js')), 'lib/tesseract.min.js exists');

// Check tesseract in manifest content_scripts
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
assert(manifest.content_scripts[0].js.includes('lib/tesseract.min.js'), 'tesseract in content_scripts');
assert(manifest.web_accessible_resources[0].resources.includes('lib/tesseract.min.js'), 'tesseract in web_accessible_resources');
assert(!JSON.stringify(manifest).includes('cdn.jsdelivr.net'), 'manifest has no CDN host permissions');

console.log('\n=== Build Manifests ===');
try {
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { cwd: __dirname, stdio: 'pipe' });
    const chromeManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist/chrome/manifest.json'), 'utf8'));
    const firefoxManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist/firefox/manifest.json'), 'utf8'));
    assert(!!chromeManifest.background.service_worker, 'Chrome build uses background.service_worker');
    assert(!chromeManifest.background.scripts, 'Chrome build has no background.scripts');
    assert(!!firefoxManifest.background.scripts, 'Firefox build uses background.scripts');
    assert(!firefoxManifest.background.service_worker, 'Firefox build has no background.service_worker');
    assert(!firefoxManifest.permissions.includes('webNavigation'), 'Firefox build has no webNavigation permission');
} catch(e) {
    failed++;
    console.error('  FAIL: build manifest checks: ' + e.message);
}
console.log('\n=== Results ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total: ' + (passed + failed));
if (failed > 0) {
    console.error('\nTESTS FAILED!');
    process.exit(1);
} else {
    console.log('\nAll tests passed!');
}
