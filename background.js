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
        GEL: 186.0,
        TRY: 15.0,
        THB: 14.0,
        AED: 137.0,
        CNY: 69.0,
        INR: 6.0,
        VND: 0.02,
        MYR: 107.0,
        IDR: 0.031,
        MVR: 32.0,
        date: null
    };

    const notificationUrls = new Map();

    function log(message) {
        console.log('[PassportAutoFill] ' + message);
    }

    /* ==================== CURRENCY RATES ==================== */

    const RATE_SOURCES = {
        'nbkz': { name: 'National Bank of Kazakhstan', type: 'api' },
        'auto': { name: 'Auto (current page)', type: 'html', url: null },
        'kompastour': { name: 'Kompastour', type: 'html', url: 'https://online.kz.kompastour.com/search_tour' },
        'kazunion': { name: 'KazUnion', type: 'html', url: 'https://online.kazunion.com/search_tour' },
        'joinup': { name: 'JoinUp', type: 'html', url: 'https://online.joinup.kz/search_tour' },
        'anex': { name: 'AnexTour', type: 'html', url: 'https://online3.anextour.kz/search_tour' },
        'selfie': { name: 'SelfieTravel', type: 'html', url: 'https://b2b.selfietravel.kz/search_tour' }
    };

    function fetchCurrencyRates(sourceKey) {
        if (!sourceKey) sourceKey = 'nbkz';
        var source = RATE_SOURCES[sourceKey] || RATE_SOURCES['nbkz'];
        log('Fetching currency rates from: ' + source.name);

        if (source.type === 'api') {
            fetchNbkRatesApi();
        } else if (source.type === 'html' && source.url) {
            fetch(source.url, { method: 'GET', headers: { 'Accept': 'text/html' } })
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function(html) {
                    parseCurrencyRates(html);
                    currencyRates.source = sourceKey;
                    chrome.storage.local.set({ currencyRates: currencyRates, currencyRatesDate: currencyRates.date, rateSource: sourceKey });
                })
                .catch(function(error) {
                    log('Failed to fetch from ' + source.name + ': ' + error.message + ' — falling back to API');
                    fetchNbkRatesApi();
                });
        } else {
            fetchNbkRatesApi();
        }
    }

    function fetchNbkRatesApi() {
        var today = new Date();
        var dd = String(today.getDate()).padStart(2, '0');
        var mm = String(today.getMonth() + 1).padStart(2, '0');
        var yyyy = today.getFullYear();
        var dateStr = dd + '.' + mm + '.' + yyyy;

        var apiUrl = 'https://api.exchangerate-api.com/v4/latest/USD';
        log('Fetching rates from exchangerate-api.com (CORS-free)');
        currencyRates.date = dateStr;

        fetch(apiUrl)
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function(data) {
                if (!data.rates) throw new Error('No rates in response');
                var usdToKzt = data.rates['KZT'];
                if (!usdToKzt) throw new Error('No KZT rate');

                currencyRates.USD = usdToKzt;
                currencyRates.EUR = usdToKzt / data.rates['EUR'] * usdToKzt || (usdToKzt / 0.92);
                if (data.rates['EUR']) currencyRates.EUR = usdToKzt / data.rates['EUR'];
                if (data.rates['RUB']) currencyRates.RUB = usdToKzt / data.rates['RUB'];
                if (data.rates['GBP']) currencyRates.GBP = usdToKzt / data.rates['GBP'];
                if (data.rates['CNY']) currencyRates.CNY = usdToKzt / data.rates['CNY'];
                if (data.rates['TRY']) currencyRates.TRY = usdToKzt / data.rates['TRY'];
                if (data.rates['AED']) currencyRates.AED = usdToKzt / data.rates['AED'];
                if (data.rates['INR']) currencyRates.INR = usdToKzt / data.rates['INR'];
                if (data.rates['THB']) currencyRates.THB = usdToKzt / data.rates['THB'];
                if (data.rates['UZS']) currencyRates.UZS = usdToKzt / data.rates['UZS'];
                if (data.rates['KGS']) currencyRates.KGS = usdToKzt / data.rates['KGS'];
                if (data.rates['AZN']) currencyRates.AZN = usdToKzt / data.rates['AZN'];
                if (data.rates['GEL']) currencyRates.GEL = usdToKzt / data.rates['GEL'];
                if (data.rates['VND']) currencyRates.VND = usdToKzt / data.rates['VND'];
                if (data.rates['MYR']) currencyRates.MYR = usdToKzt / data.rates['MYR'];
                if (data.rates['IDR']) currencyRates.IDR = usdToKzt / data.rates['IDR'];

                currencyRates.source = 'nbkz';
                chrome.storage.local.set({ currencyRates: currencyRates, currencyRatesDate: currencyRates.date, rateSource: 'nbkz' });
                log('API rates updated: USD=' + currencyRates.USD + ', EUR=' + currencyRates.EUR + ', RUB=' + currencyRates.RUB);
            })
            .catch(function(error) {
                log('exchangerate-api failed: ' + error.message + ' — trying open.er-api.com');
                fetch('https://open.er-api.com/v6/latest/USD')
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data.rates) throw new Error('No rates');
                        var usdToKzt = data.rates['KZT'];
                        if (!usdToKzt) throw new Error('No KZT');
                        currencyRates.USD = usdToKzt;
                        var codes = ['EUR','RUB','GBP','CNY','TRY','AED','INR','THB','UZS','KGS','AZN','GEL','VND','MYR','IDR'];
                        codes.forEach(function(code) {
                            if (data.rates[code]) currencyRates[code] = usdToKzt / data.rates[code];
                        });
                        currencyRates.source = 'nbkz';
                        currencyRates.date = dateStr;
                        chrome.storage.local.set({ currencyRates: currencyRates, currencyRatesDate: currencyRates.date, rateSource: 'nbkz' });
                        log('Fallback API rates: USD=' + currencyRates.USD + ', EUR=' + currencyRates.EUR);
                    })
                    .catch(function(err) {
                        log('All API attempts failed: ' + err.message);
                    });
            });
    }

    function parseCurrencyRates(html) {
        try {
            var found = false;

            // Pattern 1: SAMO-Tour currency table (Kompastour, KazUnion, JoinUp, Anex, Selfie)
            // <table class="currency res panel"> ... <th data-currency='{"currency":3,"base":8}'>€</th> ... <td>565 KZT</td>
            var samoTableMatch = html.match(/<table[^>]*class="[^"]*currency[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
            if (samoTableMatch) {
                var tableHtml = samoTableMatch[1];
                var thMatches = tableHtml.match(/<th[^>]*data-currency='(\{[^']+\})'[^>]*>([^<]*)<\/th>/gi) || [];
                var tdMatches = tableHtml.match(/<td[^>]*>([^<]*KZT[^<]*)<\/td>/gi) || [];

                var currencies = [];
                thMatches.forEach(function(th) {
                    var m = th.match(/data-currency='\{"currency":(\d+),"base":(\d+)\}'[^>]*>([^<]*)</);
                    if (m) currencies.push({ code: m[3].trim(), raw: parseInt(m[1]), base: parseInt(m[2]) });
                });

                if (currencies.length > 0 && tdMatches.length > 0) {
                    var firstRow = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/i);
                    if (firstRow) {
                        var dateM = firstRow[0].match(/(\d{2}\.\d{2}\.\d{4})/);
                        if (dateM) currencyRates.date = dateM[1];
                    }

                    var rateValues = tdMatches[0].match(/([\d\s]+)\s*KZT/i);
                    if (rateValues) {
                        currencies.forEach(function(cur, idx) {
                            var tdM = tdMatches[idx] ? tdMatches[idx].match(/([\d\s]+)\s*KZT/i) : null;
                            if (tdM) {
                                var val = parseFloat(tdM[1].replace(/\s/g, ''));
                                var symbolMap = { '€': 'EUR', '$': 'USD', '₽': 'RUB', '£': 'GBP' };
                                var code = symbolMap[cur.code] || cur.code;
                                currencyRates[code] = val;
                                found = true;
                            }
                        });
                    }
                }
            }

            // Pattern 2: Fstravel currency-row-block
            if (!found) {
                var ratesMatch = html.match(/<div class="currency-row-block"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
                if (ratesMatch) {
                    var currencyHtml = ratesMatch[1];
                    var dateMatch = html.match(/(\d{2}\.\d{2}\.\d{4})/);
                    if (dateMatch) currencyRates.date = dateMatch[1];

                    var directPatterns = [
                        { code: 'USD', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KZT/i },
                        { code: 'EUR', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*KZT/i },
                        { code: 'RUB', regex: /1\s*RUB[^\d]*(\d+\.?\d*)\s*KZT/i }
                    ];

                    directPatterns.forEach(function(item) {
                        var match = currencyHtml.match(item.regex);
                        if (match) {
                            currencyRates[item.code] = parseFloat(match[1]);
                            found = true;
                        }
                    });

                    var crossPatterns = [
                        { code: 'UZS', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*UZS/i, calc: function(rate) { return 1 / (rate / currencyRates.EUR); } },
                        { code: 'KGS', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KGS/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'AZN', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AZN/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'GEL', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*GEL/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'TRY', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*TRY/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'THB', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*THB/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'AED', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AED/i, calc: function(rate) { return currencyRates.USD / rate; } },
                        { code: 'CNY', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*CNY/i, calc: function(rate) { return currencyRates.USD / rate; } }
                    ];

                    crossPatterns.forEach(function(item) {
                        var match = currencyHtml.match(item.regex);
                        if (match && currencyRates.EUR) {
                            currencyRates[item.code] = item.calc(parseFloat(match[1]));
                            found = true;
                        }
                    });
                }
            }

            // Pattern 3: Generic number+KZT pairs anywhere
            if (!found) {
                var genericMatches = html.match(/([\d,]+\.?\d*)\s*KZT/gi);
                if (genericMatches && genericMatches.length >= 3) {
                    var symbolMatches = html.match(/(€|\$|₽|£)\s*(?:[^\d]*?)([\d,]+\.?\d*)\s*KZT/gi) || [];
                    symbolMatches.forEach(function(m) {
                        var sm = m.match(/(€|\$|₽|£)\s*(?:[^\d]*?)([\d,]+\.?\d*)\s*KZT/i);
                        if (sm) {
                            var symbolMap = { '€': 'EUR', '$': 'USD', '₽': 'RUB', '£': 'GBP' };
                            var code = symbolMap[sm[1]];
                            var val = parseFloat(sm[2].replace(/,/g, ''));
                            if (code && val) {
                                currencyRates[code] = val;
                                found = true;
                            }
                        }
                    });
                }
            }

            if (found) {
                currencyRates.source = 'auto';
                chrome.storage.local.set({ currencyRates: currencyRates, currencyRatesDate: currencyRates.date, rateSource: 'auto' });
                log('Currency rates updated: USD=' + currencyRates.USD + ', EUR=' + currencyRates.EUR + ', RUB=' + currencyRates.RUB);
            } else {
                log('No currency rates found in HTML');
            }
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
            iconUrl: 'icons/icon.png',
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
        { pattern: '*://*.kazunion.com/*', siteId: 'kazunion' },
        { pattern: '*://*.joinup.kz/*', siteId: 'joinup' },
        { pattern: '*://*.anextour.kz/*', siteId: 'anex' },
        { pattern: '*://*.selfietravel.kz/*', siteId: 'selfie' },
        { pattern: '*://*.pegast.asia/*', siteId: 'pegast' },
        { pattern: '*://*.sanat.kz/*', siteId: 'sanat' },
        { pattern: '*://*.abktourism.kz/*', siteId: 'abk' }
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
        const scripts = ['lib/pdf.min.js', 'lib/utils.js', 'i18n.js', 'passport-parser.js', 'lib/tesseract.min.js', 'content.js'];
        const css = ['style.css'];

        // Chrome uses callback, Firefox uses promise
        var execResult = chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: scripts
        });

        if (execResult && typeof execResult.then === 'function') {
            // Firefox promise-based
            execResult.then(function() {
                chrome.scripting.insertCSS({
                    target: { tabId: tabId, allFrames: true },
                    files: css
                }).catch(function(e) { log('CSS inject error: ' + e.message); });
            }).catch(function(e) { log('Inject error: ' + e.message); });
        } else {
            // Chrome callback-based
            if (chrome.runtime.lastError) {
                log('Inject error: ' + chrome.runtime.lastError.message);
                return;
            }
            chrome.scripting.insertCSS({
                target: { tabId: tabId, allFrames: true },
                files: css
            });
        }
    }

    function checkAndInject(tabId, url) {
        if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return;

        getAllDomains(function(domains) {
            const siteId = findSiteForUrl(url, domains);
            if (!siteId) return;

            chrome.tabs.sendMessage(tabId, { action: 'ping' }, function(response) {
                if (chrome.runtime.lastError || !response) {
                    log('Injecting scripts into tab ' + tabId + ' for ' + siteId);
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

    chrome.tabs.onCreated.addListener(function(tab) {
        if (tab.url) {
            setTimeout(function() { checkAndInject(tab.id, tab.url); }, 1000);
        }
    });

    // webNavigation catches popup windows that tabs.onUpdated misses
    if (chrome.webNavigation) {
        chrome.webNavigation.onCompleted.addListener(function(details) {
            if (details.frameId === 0) {
                chrome.tabs.get(details.tabId, function(tab) {
                    if (tab && tab.url) {
                        checkAndInject(details.tabId, tab.url);
                    }
                });
            }
        });
    }

    // Retry injection — sometimes popup windows need multiple attempts
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        chrome.tabs.get(activeInfo.tabId, function(tab) {
            if (tab && tab.url) {
                checkAndInject(activeInfo.tabId, tab.url);
            }
        });
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

    function extractPdfText(pdf) {
        var pages = [];
        var count = Math.min(pdf.numPages || 1, 3);
        var chain = Promise.resolve();

        for (let pageNum = 1; pageNum <= count; pageNum++) {
            chain = chain.then(function() {
                return pdf.getPage(pageNum).then(function(page) {
                    return page.getTextContent();
                }).then(function(textContent) {
                    pages.push(textContent.items.map(function(item) { return item.str; }).join('\n'));
                });
            });
        }

        return chain.then(function() { return pages.join('\n'); });
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
        chrome.storage.local.get(['rateSource'], function(res) {
            fetchCurrencyRates(res.rateSource || 'nbkz');
        });
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

        if (message.action === 'parsePdf') {
            // Firefox: content scripts can't use ReadableStream (PDF.js needs it)
            // Parse PDF in background where there are no CSP restrictions
            try {
                if (!message.data) {
                    sendResponse({ error: 'No PDF data received' });
                    return false;
                }
                var bytes = new Uint8Array(message.data);
                if (typeof pdfjsLib === 'undefined' && typeof importScripts === 'function') {
                    importScripts('lib/pdf.min.js');
                    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                        if (typeof pdfjsLib.PDFWorker === 'function') {
                            try { pdfjsLib.PDFWorker.disableWorker = true; } catch(e) {}
                        }
                    }
                }
                if (typeof pdfjsLib === 'undefined') {
                    sendResponse({ error: 'pdfjsLib not available in background' });
                    return false;
                }
                pdfjsLib.getDocument({ data: bytes, disableRange: true, disableStream: true, isEvalSupported: false }).promise
                    .then(function(pdf) {
                        return extractPdfText(pdf).then(function(text) {
                            sendResponse({ text: text });
                        }).finally(function() {
                            if (pdf && typeof pdf.destroy === 'function') pdf.destroy();
                        });
                    })
                    .catch(function(err) {
                        sendResponse({ error: err.message });
                    });
            } catch(e) {
                sendResponse({ error: e.message });
            }
            return true;
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
            var source = message.source || 'nbkz';
            chrome.storage.local.get(['rateSource'], function(res) {
                if (source === 'auto' && res.rateSource) source = res.rateSource;
                if (source === 'auto') source = 'nbkz';
                fetchCurrencyRates(source);
            });
            // Respond immediately with cached rates, popup will reload after storage update
            sendResponse(currencyRates);
            return false;
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

        if (message.action === 'exportCSV') {
            chrome.storage.local.get(['fillHistory'], function(res) {
                const history = res.fillHistory || [];
                let csv = '\uFEFFDate,Site,Name,Passport,IIN,BirthDate,Success,Warnings\n';
                history.forEach(function(h) {
                    const date = new Date(h.timestamp).toLocaleString();
                    const name = (h.name || '').replace(/,/g, ';');
                    const warnings = (h.warnings || []).join('; ').replace(/,/g, ';');
                    csv += [date, h.site || '', name, h.passport || '', h.iin || '', h.birthDate || '', h.success ? 'YES' : 'NO', warnings].join(',') + '\n';
                });
                sendResponse({ csv: csv });
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
