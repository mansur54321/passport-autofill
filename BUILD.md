# Build Instructions

## Chrome / Edge (Chromium)
Use `manifest.json` as is.

### Install:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension folder

## Firefox
Use `manifest.firefox.json` (rename to `manifest.json` or create a build).

### Quick Install:
```bash
# Create Firefox build
cp manifest.firefox.json manifest-firefox-build.json
```

Then:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest-firefox-build.json`

### Permanent Install (signed):
1. Go to https://addons.mozilla.org/developers/
2. Submit the extension for signing
