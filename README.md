# Passport AutoFill

Browser extension for automatic passport data filling from PDF files and photos on travel B2B booking sites.

## Features

### Core
- **PDF Passport Parsing** — Drag & drop PDF passport to auto-fill forms
- **Photo/Scan Support** — Drop a photo of passport, OCR extracts data automatically
- **MRZ Support** — Full ICAO Doc 9303 MRZ parsing (TD1/TD3 formats)
- **IIN Validation** — Kazakhstan IIN checksum validation with birth date & gender extraction
- **Multi-site Support** — Works on all SAMO-Tour based operators
- **Data Preview** — Edit extracted data before filling
- **Auto-update** — Automatic updates from GitHub releases

### Operators
| Operator | Status | Notes |
|----------|--------|-------|
| Fstravel | ✅ | Default |
| Kompastour | ✅ | Forces "KAZ" in series |
| KazUnion | ✅ | Standard |
| JoinUp | ✅ | Popup booking |
| AnexTour | ✅ | Expand → Bron |
| SelfieTravel | ✅ | Standard |
| Pegast | 🔜 | Custom platform (planned) |
| Sanat | 🔜 | Planned |
| ABK Tourism | 🔜 | Planned |

### Auto-Login
- **Multi-account support** — Store multiple credentials per operator
- **Account selector** — Choose account when 2+ configured
- **Session timeout re-login** — Auto re-login when session expires
- **Captcha auto-solve** — Tesseract OCR reads captcha digits

### Price & Currency
- **Price Monitor** — Real-time price tracking with KZT conversion
- **Price Comparison** — Compare prices across operators
- **Currency Rates** — Auto-extracted from operator pages or National Bank API
- **16 currencies** — USD, EUR, RUB, UZS, KGS, AZN, GEL, TRY, THB, AED, CNY, INR, VND, MYR, IDR, MVR

### Tools
- **IIN Validator** — Validate Kazakhstan IIN, extract birth date & gender
- **Passport Validity** — Check expiry against destination country requirements (24 countries)
- **Age Calculator** — Calculate age and category (Adult/Child/Infant)
- **Transliteration** — Cyrillic to Latin
- **History** — Fill history with export to CSV
- **Templates** — Save tourist data, load from PDF/photo

### UX
- **Bilingual** — Russian / English
- **Seasonal theme** — Colors change by season
- **New York Coffee aesthetic** — DM Serif Display, Newsreader, JetBrains Mono
- **Dark mode** — Automatic system dark mode
- **Passport expiry warning** — Yellow/red highlight on tourist form
- **Group fill** — Multiple PDFs/photos → multiple tourists with preview
- **SAMO popup removal** — Auto-close ad popups

## Installation

### Chrome / Edge
1. Download latest release `.zip`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the folder

### Firefox
1. Download `firefox` build
2. Open `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `manifest.json`

### Build from source
```bash
git clone https://github.com/mansur54321/passport-autofill
cd passport-autofill
node build.js          # builds both chrome and firefox
node build.js chrome    # chrome only
node build.js firefox  # firefox only
```

## Usage

1. Click extension icon → Settings → enter default email & phone
2. Add operator credentials (Settings → Auto-login)
3. Open booking form on supported site
4. Drag & drop passport PDF or photo to the drop zone
5. Review/edit extracted data and click "Fill Form"

**Keyboard shortcut:** `Ctrl+Shift+P` — open file dialog

## File Structure
```
├── manifest.json          Extension manifest (MV3)
├── build.js               Build script (Chrome + Firefox)
├── test.js                Self-tests (83 checks)
├── background.js          Service worker (auto-update, rates, injection)
├── content.js             Main content script (fill, OCR, compare, login)
├── popup.html/js          Settings popup (5 tabs)
├── i18n.js                RU/EN translations
├── passport-parser.js     MRZ/IIN parser, country rules
├── style.css              Content script styles
├── icons/                Extension icons
└── lib/
    ├── pdf.min.js         PDF.js library
    ├── pdf.worker.min.js  PDF.js worker
    ├── tesseract.min.js  OCR engine
    └── utils.js           Utility functions
```

## Self-Tests
```bash
node test.js
```
Runs 83 checks: syntax, manifest, file existence, IIN validation, passport parsing, MRZ, country rules, i18n key parity, file paths, CSP safety.

## Technical Details

### SAMO-Tour Platform
All supported operators use SAMO-Tour (САМО-Софт). Common patterns:
- `div.tourist[data-peopleinc]` — tourist blocks
- `frm[People][N][FIELD]` — form field names
- `.CLAIMPRICE` — price display
- `.bron.price_button` — booking button
- `#samo_popup` — ad popup (auto-removed)
- `#captchaForm` — captcha (auto-solved via OCR)

### Auto-Detection
- **Nationality** — Searches for "Казахстан/KAZ" in select options
- **Document type** — Priority: exact "Паспорт" → "Загранпаспорт" → "Удостоверение" → first option
- **Human type** — Auto MR/MRS/CHD/INF based on birth date

## License
MIT License