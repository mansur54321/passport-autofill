/**
 * Background Service Worker
 * Handles auto-update from GitHub releases
 */

// Firefox compatibility
if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

(function() {
    'use strict';

    var GITHUB_USER = 'mansur54321';
    var GITHUB_REPO = 'passport-autofill';
    var UPDATE_CHECK_INTERVAL = 60;
    var GITHUB_API_URL = 'https://api.github.com/repos/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases/latest';
    var RELEASES_URL = 'https://github.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases';

    var currentVersion = chrome.runtime.getManifest().version;
    var updateStatus = {
        lastCheck: null,
        latestVersion: null,
        hasUpdate: false,
        error: null,
        changelog: null
    };
    
    var currencyRates = {
        USD: 504.0,
        EUR: 598.0,
        RUB: 6.5,
        UZS: 0.041,
        KGS: 5.77,
        AZN: 296.0,
        date: null
    };

    function log(message) {
        console.log('[PassportAutoFill] ' + message);
    }

    /* ==================== CURRENCY RATES ==================== */
    
    function fetchCurrencyRates() {
        log('Fetching currency rates from fstravel.asia...');
        
        fetch('https://fstravel.asia/', {
            method: 'GET',
            headers: {
                'Accept': 'text/html'
            }
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.text();
        })
        .then(function(html) {
            parseCurrencyRates(html);
        })
        .catch(function(error) {
            log('Failed to fetch currency rates: ' + error.message);
            chrome.storage.local.get(['currencyRates'], function(res) {
                if (res.currencyRates) {
                    currencyRates = res.currencyRates;
                }
            });
        });
    }
    
    function parseCurrencyRates(html) {
        try {
            var ratesMatch = html.match(/<div class="currency-row-block"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
            if (!ratesMatch) {
                log('Currency block not found in HTML');
                return;
            }
            
            var currencyHtml = ratesMatch[1];
            
            var dateMatch = html.match(/(\d{2}\.\d{2}\.\d{4})/);
            if (dateMatch) {
                currencyRates.date = dateMatch[1];
            }
            
            var patterns = [
                { code: 'USD', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'EUR', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'RUB', regex: /1\s*RUB[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'UZS', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*UZS/i },
                { code: 'KGS', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KGS/i },
                { code: 'AZN', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AZN/i }
            ];
            
            patterns.forEach(function(item) {
                var match = currencyHtml.match(item.regex);
                if (match) {
                    var rate = parseFloat(match[1]);
                    if (item.code === 'UZS') {
                        currencyRates.UZS = 1 / (rate / currencyRates.EUR);
                    } else if (item.code === 'KGS') {
                        currencyRates.KGS = currencyRates.USD / rate;
                    } else if (item.code === 'AZN') {
                        currencyRates.AZN = currencyRates.USD / rate;
                    } else {
                        currencyRates[item.code] = rate;
                    }
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
    
    function getCurrencyRates() {
        return currencyRates;
    }

    function checkForUpdates(forceCheck) {
        log('Checking for updates... Current version: ' + currentVersion);

        if (forceCheck) {
            updateStatus.error = null;
            saveUpdateStatus();
        }

        fetch(GITHUB_API_URL)
            .then(function(response) {
                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('GitHub API rate limit exceeded. Try again later.');
                    }
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                var latestVersion = data.tag_name;
                if (latestVersion && latestVersion.startsWith('v')) {
                    latestVersion = latestVersion.substring(1);
                }

                log('Latest version: ' + latestVersion);

                updateStatus.lastCheck = new Date().toISOString();
                updateStatus.latestVersion = latestVersion;
                updateStatus.hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
                updateStatus.error = null;
                updateStatus.changelog = parseChangelog(data.body);
                updateStatus.releaseUrl = data.html_url;
                updateStatus.downloadUrl = data.zipball_url;

                saveUpdateStatus();

                if (updateStatus.hasUpdate) {
                    showUpdateNotification(data);
                }
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
        
        var lines = body.split('\n');
        var changelog = [];
        var currentSection = null;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            
            if (line.match(/^#{1,3}\s+(.+)/)) {
                currentSection = line.replace(/^#+\s+/, '');
                continue;
            }
            
            if (line.match(/^[-*]\s+(.+)/)) {
                var item = line.replace(/^[-*]\s+/, '');
                item = item.replace(/\*\*(.+?)\*\*/g, '$1');
                item = item.replace(/`(.+?)`/g, '$1');
                if (item.length > 0) {
                    changelog.push(item);
                }
            }
        }

        return changelog.slice(0, 10);
    }

    function saveUpdateStatus() {
        chrome.storage.local.set({ updateStatus: updateStatus });
    }

    function loadUpdateStatus(callback) {
        chrome.storage.local.get(['updateStatus'], function(result) {
            if (result.updateStatus) {
                updateStatus = result.updateStatus;
            }
            if (callback) callback(updateStatus);
        });
    }

    function compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;
        var parts1 = v1.split('.').map(Number);
        var parts2 = v2.split('.').map(Number);

        for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            var p1 = parts1[i] || 0;
            var p2 = parts2[i] || 0;

            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }

        return 0;
    }

    function showUpdateNotification(releaseData) {
        var version = releaseData.tag_name || releaseData.name;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Passport AutoFill Update Available',
            message: 'Version ' + version + ' is available. Click to download.',
            priority: 2
        }, function(notificationId) {
            chrome.notifications.onClicked.addListener(function(clickedId) {
                if (clickedId === notificationId) {
                    chrome.tabs.create({ url: RELEASES_URL });
                }
            });
        });

        log('Update notification shown for version ' + version);
    }

    function setUpdateAlarm() {
        chrome.alarms.create('checkUpdates', {
            periodInMinutes: UPDATE_CHECK_INTERVAL
        });
    }

    chrome.runtime.onInstalled.addListener(function(details) {
        log('Extension installed: ' + details.reason);

        if (details.reason === 'install' || details.reason === 'update') {
            checkForUpdates(false);
        }

        setUpdateAlarm();
    });

    chrome.runtime.onStartup.addListener(function() {
        log('Browser started');
        loadUpdateStatus();
        setUpdateAlarm();
        fetchCurrencyRates();
    });

    chrome.alarms.onAlarm.addListener(function(alarm) {
        if (alarm.name === 'checkUpdates') {
            checkForUpdates(false);
        }
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === 'checkUpdate') {
            updateStatus.error = null;
            
            fetch(GITHUB_API_URL)
                .then(function(response) {
                    if (!response.ok) {
                        if (response.status === 403) {
                            throw new Error('GitHub API rate limit exceeded');
                        }
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    var latestVersion = data.tag_name;
                    if (latestVersion && latestVersion.startsWith('v')) {
                        latestVersion = latestVersion.substring(1);
                    }

                    log('Latest version: ' + latestVersion);

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
                    log('Update check failed: ' + error.message);
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
            return true;
        }

        if (message.action === 'validateIIN') {
            var result = validateIIN(message.iin);
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
        
        return false;
    });

    /* ==================== IIN VALIDATION ==================== */
    
    function validateIIN(iin) {
        if (!iin || iin.length !== 12 || !/^\d{12}$/.test(iin)) {
            return { valid: false, error: 'IIN must be 12 digits' };
        }

        var weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        var weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

        var sum1 = 0;
        for (var i = 0; i < 11; i++) {
            sum1 += parseInt(iin[i]) * weights1[i];
        }
        var checkDigit = sum1 % 11;
        
        if (checkDigit === 10) {
            var sum2 = 0;
            for (var j = 0; j < 11; j++) {
                sum2 += parseInt(iin[j]) * weights2[j];
            }
            checkDigit = sum2 % 11;
        }

        if (checkDigit !== parseInt(iin[11])) {
            return { valid: false, error: 'Invalid checksum' };
        }

        var century = parseInt(iin[6]);
        var yearPrefix;
        if (century <= 2) yearPrefix = '18';
        else if (century <= 4) yearPrefix = '19';
        else yearPrefix = '20';

        var year = yearPrefix + iin.substring(0, 2);
        var month = iin.substring(2, 4);
        var day = iin.substring(4, 6);

        return {
            valid: true,
            info: {
                birthDate: day + '.' + month + '.' + year,
                gender: (century % 2 === 1) ? '1' : '0'
            }
        };
    }

    /* ==================== HISTORY LOGGING ==================== */
    
    function logFillOperation(data) {
        chrome.storage.local.get(['fillHistory'], function(res) {
            var history = res.fillHistory || [];
            
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

            if (history.length > 100) {
                history = history.slice(0, 100);
            }

            chrome.storage.local.set({ fillHistory: history });
            log('Operation logged: ' + data.surname + ' ' + data.name);
        });
    }

    log('Background service worker started. Version: ' + currentVersion);
})();
