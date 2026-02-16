/**
 * Popup Script
 * Handles extension popup UI and settings
 */

(function() {
    'use strict';

    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var PHONE_REGEX = /^\d{10,12}$/;

    function cleanPhone(phone) {
        return phone.replace(/[\s\-\(\)]/g, '');
    }

    function validateEmail(email) {
        return !email || EMAIL_REGEX.test(email);
    }

    function validatePhone(phone) {
        if (!phone) return true;
        var cleaned = cleanPhone(phone);
        return PHONE_REGEX.test(cleaned);
    }

    function showError(elementId, message) {
        var el = document.getElementById(elementId);
        if (el) {
            el.style.borderColor = '#dc3545';
            var errorEl = document.getElementById(elementId + '-error');
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            }
        }
    }

    function clearError(elementId) {
        var el = document.getElementById(elementId);
        if (el) {
            el.style.borderColor = '#ccc';
            var errorEl = document.getElementById(elementId + '-error');
            if (errorEl) {
                errorEl.style.display = 'none';
            }
        }
    }

    function loadSettings() {
        chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill'], function(res) {
            if (res.defaultEmail) {
                document.getElementById('email').value = res.defaultEmail;
            }
            if (res.defaultPhone) {
                document.getElementById('phone').value = res.defaultPhone;
            }
            document.getElementById('autoFill').checked = res.autoFill || false;
        });

        var versionEl = document.getElementById('version');
        if (versionEl) {
            var version = chrome.runtime.getManifest().version;
            versionEl.textContent = version;
        }

        loadUpdateStatus();
    }

    function loadUpdateStatus() {
        chrome.runtime.sendMessage({ action: 'getUpdateStatus' }, function(status) {
            if (status) {
                displayUpdateStatus(status);
            }
        });
    }

    function displayUpdateStatus(status) {
        var statusEl = document.getElementById('updateStatus');
        var changelogEl = document.getElementById('changelog');
        
        if (!statusEl) return;

        statusEl.style.display = 'block';

        if (status.error) {
            statusEl.className = 'update-status error';
            statusEl.innerHTML = '<strong>Error:</strong> ' + escapeHtml(status.error);
            changelogEl.style.display = 'none';
        } else if (status.hasUpdate) {
            statusEl.className = 'update-status available';
            statusEl.innerHTML = '<strong>Update available!</strong> v' + escapeHtml(status.latestVersion) + 
                '<br><a href="https://github.com/mansur54321/passport-autofill/releases/latest" target="_blank">Download</a>';
            
            if (status.changelog && status.changelog.length > 0) {
                showChangelog(status.changelog);
            }
        } else if (status.latestVersion) {
            statusEl.className = 'update-status uptodate';
            statusEl.innerHTML = '<strong>Up to date!</strong> v' + escapeHtml(status.latestVersion);
            changelogEl.style.display = 'none';
        }

        if (status.lastCheck) {
            var lastCheck = new Date(status.lastCheck);
            var timeAgo = getTimeAgo(lastCheck);
            statusEl.innerHTML += '<br><small>Last check: ' + timeAgo + '</small>';
        }
    }

    function showChangelog(items) {
        var changelogEl = document.getElementById('changelog');
        if (!changelogEl || !items || items.length === 0) return;

        var html = '<h4>What\'s new:</h4><ul>';
        for (var i = 0; i < items.length; i++) {
            html += '<li>' + escapeHtml(items[i]) + '</li>';
        }
        html += '</ul>';
        
        changelogEl.innerHTML = html;
        changelogEl.style.display = 'block';
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getTimeAgo(date) {
        var seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
        return Math.floor(seconds / 86400) + ' days ago';
    }

    function saveSettings() {
        var email = document.getElementById('email').value.trim();
        var phone = document.getElementById('phone').value.trim();
        var autoFill = document.getElementById('autoFill').checked;

        var hasErrors = false;

        if (!validateEmail(email)) {
            showError('email', 'Invalid email format');
            hasErrors = true;
        } else {
            clearError('email');
        }

        if (!validatePhone(phone)) {
            showError('phone', 'Enter 10-12 digits');
            hasErrors = true;
        } else {
            clearError('phone');
        }

        if (hasErrors) return;

        var cleanedPhone = cleanPhone(phone);

        chrome.storage.local.set({
            defaultEmail: email,
            defaultPhone: cleanedPhone,
            autoFill: autoFill
        }, function() {
            var msg = document.getElementById('msg');
            msg.style.display = 'block';
            setTimeout(function() {
                msg.style.display = 'none';
            }, 2000);
        });
    }

    function checkForUpdate() {
        var btn = document.getElementById('checkUpdateBtn');
        var statusEl = document.getElementById('updateStatus');
        var changelogEl = document.getElementById('changelog');
        var originalText = btn.textContent;

        btn.textContent = 'Checking...';
        btn.disabled = true;
        
        statusEl.className = 'update-status checking';
        statusEl.innerHTML = 'Checking for updates...';
        statusEl.style.display = 'block';
        changelogEl.style.display = 'none';

        chrome.runtime.sendMessage({ action: 'checkUpdate' }, function(response) {
            setTimeout(function() {
                btn.textContent = originalText;
                btn.disabled = false;
                
                if (response) {
                    displayUpdateStatus(response);
                }
            }, 1500);
        });
    }

    document.getElementById('email').addEventListener('input', function() {
        clearError('email');
    });
    document.getElementById('phone').addEventListener('input', function() {
        clearError('phone');
    });

    document.getElementById('saveBtn').addEventListener('click', saveSettings);

    var checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkForUpdate);
    }

    document.addEventListener('DOMContentLoaded', loadSettings);
})();
