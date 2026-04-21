if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

if (typeof importScripts === 'function') {
    try { importScripts('passport-parser.js'); } catch(e) {}
}

(function() {
    'use strict';

    const GITHUB_USER = 'mansur54321';
    const GITHUB_REPO = 'passport-autofill';
    const UPDATE_CHECK_INTERVAL = 60;
    const GITHUB_API_URL = 'https://api.github.com/repos/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases/latest';
    const RELEASES_URL = 'https://github.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases';

    const currentVersion = chrome.runtime.getManifest().version;
    let updateStatus = {
        lastCheck: null,
        latestVersion: null,
        hasUpdate: false,
        error: null,
        changelog: null
    };

    let currencyRates = {
        USD: 504.0,
        EUR: 598.0,
        RUB: 6.5,
        UZS: 0.041,
        KGS: 5.77,
        AZN: 296.0,
        date: null
    };

    const notificationUrls = new Map();

    function log(message) {
        console.log('[PassportAutoFill] ' + message);
    }

    /* ==================== CURRENCY RATES ==================== */

    function fetchCurrencyRates() {
        log('Fetching currency rates from fstravel.asia...');

        fetch('https://fstravel.asia/', {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        })
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        })
        .then(function(html) {
            parseCurrencyRates(html);
        })
        .catch(function(error) {
            log('Failed to fetch currency rates: ' + error.message);
            chrome.storage.local.get(['currencyRates'], function(res) {
                if (res.currencyRates) currencyRates = res.currencyRates;
            });
        });
    }

    function parseCurrencyRates(html) {
        try {
            const ratesMatch = html.match(/<div class="currency-row-block"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
            if (!ratesMatch) {
                log('Currency block not found in HTML');
                return;
            }

            const currencyHtml = ratesMatch[1];

            const dateMatch = html.match(/(\d{2}\.\d{2}\.\d{4})/);
            if (dateMatch) currencyRates.date = dateMatch[1];

            const directPatterns = [
                { code: 'USD', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'EUR', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'RUB', regex: /1\s*RUB[^\d]*(\d+\.?\d*)\s*KZT/i }
            ];

            const crossPatterns = [
                { code: 'UZS', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*UZS/i, calc: (rate) => 1 / (rate / currencyRates.EUR) },
                { code: 'KGS', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KGS/i, calc: (rate) => currencyRates.USD / rate },
                { code: 'AZN', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AZN/i, calc: (rate) => currencyRates.USD / rate }
            ];

            directPatterns.forEach(function(item) {
                const match = currencyHtml.match(item.regex);
                if (match) currencyRates[item.code] = parseFloat(match[1]);
            });

            crossPatterns.forEach(function(item) {
                const match = currencyHtml.match(item.regex);
                if (match && currencyRates.EUR) {
                    currencyRates[item.code] = item.calc(parseFloat(match[1]));
                }
            });

            chrome.storage.local.set({
                currencyRates: currencyRates,
                currencyRatesDate: currencyRates.date
            });

            log('Currency rates updated: USD=' + currencyRates.USD + ', EUR=' + currencyRates.EUR + ', RUB=' + currencyRates.RUB);
        } catch (e) {
            log('Error parsing currency rates: ' + e.message);
        }
    }

    /* ==================== AUTO-UPDATE ==================== */

    function checkForUpdates(forceCheck) {
        log('Checking for updates... Current version: ' + currentVersion);

        if (forceCheck) {
            updateStatus.error = null;
            saveUpdateStatus();
        }

        fetch(GITHUB_API_URL)
            .then(function(response) {
                if (!response.ok) {
                    if (response.status === 403) throw new Error('GitHub API rate limit exceeded. Try again later.');
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                let latestVersion = data.tag_name;
                if (latestVersion && latestVersion.startsWith('v')) latestVersion = latestVersion.substring(1);

                log('Latest version: ' + latestVersion);

                updateStatus.lastCheck = new Date().toISOString();
                updateStatus.latestVersion = latestVersion;
                updateStatus.hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
                updateStatus.error = null;
                updateStatus.changelog = parseChangelog(data.body);
                updateStatus.releaseUrl = data.html_url;
                updateStatus.downloadUrl = data.zipball_url;

                saveUpdateStatus();

                if (updateStatus.hasUpdate) showUpdateNotification(data);
            })
            .catch(function(error) {
                log('Update check failed: ' + error.message);
                updateStatus.lastCheck = new Date().toISOString();
                updateStatus.error = error.message;
                saveUpdateStatus();
            });
    }

    function parseChangelog(body) {
        if (!body) return [];
        const lines = body.split('\n');
        const changelog = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.match(/^[-*]\s+(.+)/)) {
                let item = line.replace(/^[-*]\s+/, '');
                item = item.replace(/\*\*(.+?)\*\*/g, '$1');
                item = item.replace(/`(.+?)`/g, '$1');
                if (item.length > 0) changelog.push(item);
            }
        }
        return changelog.slice(0, 10);
    }

    function saveUpdateStatus() {
        chrome.storage.local.set({ updateStatus: updateStatus });
    }

    function loadUpdateStatus(callback) {
        chrome.storage.local.get(['updateStatus'], function(result) {
            if (result.updateStatus) updateStatus = result.updateStatus;
            if (callback) callback(updateStatus);
        });
    }

    function compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    function showUpdateNotification(releaseData) {
        const version = releaseData.tag_name || releaseData.name;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Passport AutoFill Update Available',
            message: 'Version ' + version + ' is available. Click to download.',
            priority: 2
        }, function(notificationId) {
            notificationUrls.set(notificationId, RELEASES_URL);
        });
    }

    chrome.notifications.onClicked.addListener(function(notificationId) {
        const url = notificationUrls.get(notificationId);
        if (url) {
            chrome.tabs.create({ url: url });
            notificationUrls.delete(notificationId);
        }
    });

    function setUpdateAlarm() {
        chrome.alarms.create('checkUpdates', { periodInMinutes: UPDATE_CHECK_INTERVAL });
    }

    /* ==================== DYNAMIC DOMAIN INJECTION ==================== */

    const DEFAULT_DOMAINS = [
        { pattern: '*://*.fstravel.asia/*', siteId: 'fstravel' },
        { pattern: '*://*.fstravel.com/*', siteId: 'fstravel' },
        { pattern: '*://*.kompastour.kz/*', siteId: 'kompastour' },
        { pattern: '*://*.kompastour.com/*', siteId: 'kompastour' },
        { pattern: '*://*.kazunion.com/*', siteId: 'kazunion' }
    ];

    function getCustomDomains(callback) {
        chrome.storage.local.get(['customDomains'], function(res) {
            callback(res.customDomains || []);
        });
    }

    function getAllDomains(callback) {
        getCustomDomains(function(custom) {
            callback([...DEFAULT_DOMAINS, ...custom]);
        });
    }

    function matchesPattern(url, pattern) {
        const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return re.test(url);
    }

    function findSiteForUrl(url, domains) {
        for (const domain of domains) {
            if (matchesPattern(url, domain.pattern)) return domain.siteId;
        }
        return null;
    }

    function injectContentScripts(tabId) {
        const scripts = ['pdf.min.js', 'utils.js', 'passport-parser.js', 'content.js'];
        const css = ['style.css'];

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: scripts
        }, function() {
            chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: css
            });
        });
    }

    function checkAndInject(tabId, url) {
        if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return;

        getAllDomains(function(domains) {
            const siteId = findSiteForUrl(url, domains);
            if (!siteId) return;

            chrome.tabs.sendMessage(tabId, { action: 'ping' }, function(response) {
                if (chrome.runtime.lastError || !response) {
                    injectContentScripts(tabId);
                }
            });
        });
    }

    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        if (changeInfo.status === 'complete' && tab.url) {
            checkAndInject(tabId, tab.url);
        }
    });

    /* ==================== KEYBOARD SHORTCUT ==================== */

    chrome.commands.onCommand.addListener(function(command) {
        if (command === 'open-file-dialog') {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'openFileDialog' });
                }
            });
        }
    });

    /* ==================== FORM BADGE ==================== */

    function updateBadge(tabId, hasForm) {
        const text = hasForm ? 'ON' : '';
        const color = hasForm ? '#4caf50' : '#9e9e9e';
        chrome.action.setBadgeText({ text: text, tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
    }

    /* ==================== MESSAGE HANDLER ==================== */

    chrome.runtime.onInstalled.addListener(function(details) {
        log('Extension installed: ' + details.reason);
        if (details.reason === 'install' || details.reason === 'update') checkForUpdates(false);
        setUpdateAlarm();
    });

    chrome.runtime.onStartup.addListener(function() {
        log('Browser started');
        loadUpdateStatus();
        setUpdateAlarm();
        fetchCurrencyRates();
    });

    chrome.alarms.onAlarm.addListener(function(alarm) {
        if (alarm.name === 'checkUpdates') checkForUpdates(false);
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === 'checkUpdate') {
            updateStatus.error = null;
            fetch(GITHUB_API_URL)
                .then(function(response) {
                    if (!response.ok) {
                        if (response.status === 403) throw new Error('GitHub API rate limit exceeded');
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    let latestVersion = data.tag_name;
                    if (latestVersion && latestVersion.startsWith('v')) latestVersion = latestVersion.substring(1);
                    updateStatus.lastCheck = new Date().toISOString();
                    updateStatus.latestVersion = latestVersion;
                    updateStatus.hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
                    updateStatus.error = null;
                    updateStatus.changelog = parseChangelog(data.body);
                    updateStatus.releaseUrl = data.html_url;
                    saveUpdateStatus();
                    sendResponse(updateStatus);
                })
                .catch(function(error) {
                    updateStatus.lastCheck = new Date().toISOString();
                    updateStatus.error = error.message;
                    saveUpdateStatus();
                    sendResponse(updateStatus);
                });
            return true;
        }

        if (message.action === 'getUpdateStatus') {
            loadUpdateStatus(sendResponse);
            return true;
        }

        if (message.action === 'getVersion') {
            sendResponse({ version: currentVersion });
            return false;
        }

        if (message.action === 'validateIIN') {
            const result = PassportParser.validateIINFull(message.iin);
            sendResponse(result);
            return false;
        }

        if (message.action === 'logFillOperation') {
            logFillOperation(message.data);
            sendResponse({ success: true });
            return false;
        }

        if (message.action === 'getCurrencyRates') {
            chrome.storage.local.get(['currencyRates', 'currencyRatesDate'], function(res) {
                if (res.currencyRates) {
                    currencyRates = res.currencyRates;
                    currencyRates.date = res.currencyRatesDate;
                }
                sendResponse(currencyRates);
            });
            return true;
        }

        if (message.action === 'fetchCurrencyRates') {
            fetch('https://fstravel.asia/')
                .then(function(response) { return response.text(); })
                .then(function(html) {
                    parseCurrencyRates(html);
                    sendResponse(currencyRates);
                })
                .catch(function(error) {
                    log('Fetch currency rates error: ' + error.message);
                    sendResponse(currencyRates);
                });
            return true;
        }

        if (message.action === 'formDetected') {
            const tabId = sender.tab ? sender.tab.id : null;
            if (tabId) updateBadge(tabId, message.hasForm);
            return false;
        }

        if (message.action === 'getDomains') {
            getAllDomains(sendResponse);
            return true;
        }

        if (message.action === 'addDomain') {
            getCustomDomains(function(custom) {
                const existing = custom.find(d => d.pattern === message.domain.pattern);
                if (!existing) {
                    custom.push({ pattern: message.domain.pattern, siteId: message.domain.siteId });
                    chrome.storage.local.set({ customDomains: custom }, function() {
                        sendResponse({ success: true, domains: [...DEFAULT_DOMAINS, ...custom] });
                    });
                } else {
                    sendResponse({ success: false, error: 'Pattern already exists' });
                }
            });
            return true;
        }

        if (message.action === 'removeDomain') {
            getCustomDomains(function(custom) {
                const filtered = custom.filter(d => d.pattern !== message.pattern);
                chrome.storage.local.set({ customDomains: filtered }, function() {
                    sendResponse({ success: true, domains: [...DEFAULT_DOMAINS, ...filtered] });
                });
            });
            return true;
        }

        if (message.action === 'getTemplates') {
            chrome.storage.local.get(['touristTemplates'], function(res) {
                sendResponse(res.touristTemplates || []);
            });
            return true;
        }

        if (message.action === 'saveTemplate') {
            chrome.storage.local.get(['touristTemplates'], function(res) {
                const templates = res.touristTemplates || [];
                const idx = templates.findIndex(t => t.id === message.template.id);
                if (idx >= 0) {
                    templates[idx] = message.template;
                } else {
                    templates.push(message.template);
                }
                chrome.storage.local.set({ touristTemplates: templates }, function() {
                    sendResponse({ success: true, templates: templates });
                });
            });
            return true;
        }

        if (message.action === 'deleteTemplate') {
            chrome.storage.local.get(['touristTemplates'], function(res) {
                const templates = (res.touristTemplates || []).filter(t => t.id !== message.id);
                chrome.storage.local.set({ touristTemplates: templates }, function() {
                    sendResponse({ success: true, templates: templates });
                });
            });
            return true;
        }

        if (message.action === 'exportSettings') {
            chrome.storage.local.get(null, function(data) {
                sendResponse({ data: data, version: currentVersion, exportDate: new Date().toISOString() });
            });
            return true;
        }

        if (message.action === 'importSettings') {
            try {
                const imported = message.settings;
                if (!imported || !imported.data) {
                    sendResponse({ success: false, error: 'Invalid format' });
                    return false;
                }
                chrome.storage.local.set(imported.data, function() {
                    sendResponse({ success: true });
                });
                return true;
            } catch (e) {
                sendResponse({ success: false, error: e.message });
                return false;
            }
        }

        if (message.action === 'requestOptionalPermission') {
            chrome.permissions.request({ origins: [message.origin] }, function(granted) {
                sendResponse({ granted: granted });
            });
            return true;
        }

        return false;
    });

    /* ==================== HISTORY LOGGING ==================== */

    function logFillOperation(data) {
        chrome.storage.local.get(['fillHistory'], function(res) {
            let history = res.fillHistory || [];

            history.unshift({
                timestamp: Date.now(),
                site: data.site,
                name: data.surname + ' ' + data.name,
                passport: data.number,
                iin: data.iin,
                birthDate: data.birthDate,
                success: data.success,
                warnings: data.warnings || []
            });

            if (history.length > 100) history = history.slice(0, 100);

            chrome.storage.local.set({ fillHistory: history });
            log('Operation logged: ' + data.surname + ' ' + data.name);
        });
    }

    log('Background service worker started. Version: ' + currentVersion);
})();
