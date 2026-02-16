/**
 * Background Service Worker
 * Handles auto-update from GitHub releases
 */

(function() {
    'use strict';

    var GITHUB_USER = 'mansur54321';
    var GITHUB_REPO = 'passport-autofill';
    var UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
    var GITHUB_API_URL = 'https://api.github.com/repos/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases/latest';

    var currentVersion = chrome.runtime.getManifest().version;

    function log(message) {
        console.log('[PassportAutoFill] ' + message);
    }

    function checkForUpdates() {
        log('Checking for updates... Current version: ' + currentVersion);

        fetch(GITHUB_API_URL)
            .then(function(response) {
                if (!response.ok) {
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

                if (compareVersions(latestVersion, currentVersion) > 0) {
                    showUpdateNotification(data);
                }
            })
            .catch(function(error) {
                log('Update check failed: ' + error.message);
            });
    }

    function compareVersions(v1, v2) {
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
        var downloadUrl = 'https://github.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/releases/latest';

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Passport AutoFill Update Available',
            message: 'Version ' + version + ' is available. Click to download.',
            priority: 2
        }, function(notificationId) {
            chrome.notifications.onClicked.addListener(function(clickedId) {
                if (clickedId === notificationId) {
                    chrome.tabs.create({ url: downloadUrl });
                }
            });
        });

        log('Update notification shown for version ' + version);
    }

    function setUpdateAlarm() {
        chrome.alarms.create('checkUpdates', {
            periodInMinutes: UPDATE_CHECK_INTERVAL / 60000
        });
    }

    chrome.runtime.onInstalled.addListener(function(details) {
        log('Extension installed: ' + details.reason);

        if (details.reason === 'install') {
            checkForUpdates();
        }

        setUpdateAlarm();
    });

    chrome.runtime.onStartup.addListener(function() {
        log('Browser started');
        checkForUpdates();
        setUpdateAlarm();
    });

    chrome.alarms.onAlarm.addListener(function(alarm) {
        if (alarm.name === 'checkUpdates') {
            checkForUpdates();
        }
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === 'checkUpdate') {
            checkForUpdates();
            sendResponse({ status: 'checking' });
        }
        if (message.action === 'getVersion') {
            sendResponse({ version: currentVersion });
        }
        return true;
    });

    log('Background service worker started. Version: ' + currentVersion);
})();
