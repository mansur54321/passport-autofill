# Passport AutoFill Extension

Browser extension for automatic passport data filling from PDF files.

## Features

- **PDF Passport Parsing**: Drag & drop PDF passport to auto-fill forms
- **MRZ Support**: Full ICAO Doc 9303 MRZ parsing (TD1/TD3 formats)
- **IIN Validation**: Kazakhstan IIN checksum validation
- **Multi-site Support**: Fstravel, Kompastour, KazUnion
- **Price Monitor**: Real-time price change tracking
- **Data Preview**: Edit extracted data before filling
- **Auto-update**: Automatic updates from GitHub releases

## Installation

### From Source
1. Clone or download this repository
2. Open Chrome/Edge -> Extensions -> Developer mode
3. Click "Load unpacked" and select the extension folder

### From GitHub Releases
Download the latest `.crx` or `.zip` from [Releases](releases)

## Usage

1. Click extension icon to set default email/phone
2. Open booking form on supported site
3. Drag & drop passport PDF to the drop zone
4. Review/edit extracted data and click "Fill Form"

## Configuration

Click the extension icon to access settings:

- **Email**: Default email for all tourists
- **Phone**: Default phone number (10-12 digits)
- **Auto-fill**: Skip preview dialog (fill immediately)

## Supported Sites

| Site | Nationality ID | Notes |
|------|---------------|-------|
| Fstravel | 367404 | Default |
| Kompastour | 7 | Forces "KAZ" in series |
| KazUnion | 7 | Standard |

## Technical Details

### Files Structure
```
├── manifest.json       - Extension manifest (MV3)
├── content.js          - Main content script
├── passport-parser.js  - MRZ/IIN parser module
├── utils.js            - Utility functions
├── popup.html/js       - Settings popup
├── background.js       - Service worker (auto-update)
├── style.css           - Styles
├── pdf.min.js          - PDF.js library
└── pdf.worker.min.js   - PDF.js worker
```

### MRZ Parsing
Supports Machine Readable Zone formats:
- **TD1** (ID cards): 3 lines x 30 chars
- **TD3** (Passports): 2 lines x 44 chars

### IIN Validation
Kazakhstan Individual Identification Number (12 digits):
- Validates checksum using weighted algorithm
- Extracts birth date and gender from IIN

## Development

```bash
# No build required - load unpacked extension

# For testing, use local file access
# Chrome: --allow-file-access-from-files
```

## Version History

- **5.0** - Modular architecture, MRZ parser, IIN validation, auto-update
- **4.0** - Multi-operator support, PDF drag&drop
- **3.0** - Price monitor widget
- **2.0** - Kompastour support
- **1.0** - Initial release (Fstravel only)

## License

MIT License
