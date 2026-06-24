# Build Instructions

## Chrome / Edge (Chromium)
Use `manifest.json` as is.

### Install:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension folder

### Build:
```bash
node build.js chrome
# Output: dist/chrome/
```

## Firefox
Firefox MV3 (109+).

### Build:
```bash
node build.js firefox
# Output: dist/firefox/
```

### Install:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `dist/firefox/manifest.json`

### Permanent Install (signed):
1. Go to https://addons.mozilla.org/developers/
2. Submit the extension for signing

### Build both:
```bash
node build.js
# Output: dist/chrome/ and dist/firefox/
```

## Firefox differences from Chrome
- `background.scripts` instead of `background.service_worker`
- No `webNavigation` permission (handled gracefully)
- `optional_permissions` instead of `optional_host_permissions`
- `scripting.executeScript` uses promises (handled with fallback)
- `importScripts` not available (loaded via `background.scripts` array)
- `chrome` shim: `if (typeof browser !== 'undefined') var chrome = browser;`