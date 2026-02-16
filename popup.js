/**
 * Popup Script
 * Handles extension popup UI, settings, history, and tools
 */

(function() {
    'use strict';

    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var PHONE_REGEX = /^\d{10,12}$/;

    /* ==================== TAB NAVIGATION ==================== */
    
    function initTabs() {
        var tabs = document.querySelectorAll('.tab');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var tabId = this.getAttribute('data-tab');
                switchTab(tabId);
            });
        });
    }
    
    function switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(function(t) {
            t.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(function(c) {
            c.classList.remove('active');
        });
        
        document.querySelector('.tab[data-tab="' + tabId + '"]').classList.add('active');
        document.getElementById(tabId).classList.add('active');
        
        if (tabId === 'history') {
            loadHistory();
        }
    }

    /* ==================== SETTINGS ==================== */
    
    function cleanPhone(phone) {
        return phone.replace(/[\s\-\(\)]/g, '');
    }

    function validateEmail(email) {
        return !email || EMAIL_REGEX.test(email);
    }

    function validatePhone(phone) {
        if (!phone) return true;
        return PHONE_REGEX.test(cleanPhone(phone));
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
            if (errorEl) errorEl.style.display = 'none';
        }
    }

    function loadSettings() {
        chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill'], function(res) {
            if (res.defaultEmail) document.getElementById('email').value = res.defaultEmail;
            if (res.defaultPhone) document.getElementById('phone').value = res.defaultPhone;
            document.getElementById('autoFill').checked = res.autoFill || false;
        });

        document.getElementById('version').textContent = chrome.runtime.getManifest().version;
        loadUpdateStatus();
    }

    function saveSettings() {
        var email = document.getElementById('email').value.trim();
        var phone = document.getElementById('phone').value.trim();
        var autoFill = document.getElementById('autoFill').checked;

        if (!validateEmail(email)) {
            showError('email', 'Invalid email format');
            return;
        }
        clearError('email');

        if (!validatePhone(phone)) {
            showError('phone', 'Enter 10-12 digits');
            return;
        }
        clearError('phone');

        chrome.storage.local.set({
            defaultEmail: email,
            defaultPhone: cleanPhone(phone),
            autoFill: autoFill
        }, function() {
            showMsg('Saved!');
        });
    }

    function showMsg(text) {
        var msg = document.getElementById('msg');
        msg.textContent = text;
        msg.style.display = 'block';
        setTimeout(function() { msg.style.display = 'none'; }, 2000);
    }

    /* ==================== UPDATE STATUS ==================== */
    
    function loadUpdateStatus() {
        chrome.runtime.sendMessage({ action: 'getUpdateStatus' }, function(status) {
            if (status) displayUpdateStatus(status);
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
            if (status.changelog && status.changelog.length > 0) showChangelog(status.changelog);
        } else if (status.latestVersion) {
            statusEl.className = 'update-status uptodate';
            statusEl.innerHTML = '<strong>Up to date!</strong> v' + escapeHtml(status.latestVersion);
            changelogEl.style.display = 'none';
        }

        if (status.lastCheck) {
            statusEl.innerHTML += '<br><small>Last check: ' + getTimeAgo(new Date(status.lastCheck)) + '</small>';
        }
    }

    function showChangelog(items) {
        var changelogEl = document.getElementById('changelog');
        if (!changelogEl || !items || !items.length) return;
        var html = '<h4>What\'s new:</h4><ul>';
        items.forEach(function(item) { html += '<li>' + escapeHtml(item) + '</li>'; });
        html += '</ul>';
        changelogEl.innerHTML = html;
        changelogEl.style.display = 'block';
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
            btn.textContent = originalText;
            btn.disabled = false;
            if (response) displayUpdateStatus(response);
            else {
                statusEl.className = 'update-status error';
                statusEl.innerHTML = '<strong>Error:</strong> No response';
            }
        });
    }

    /* ==================== HISTORY ==================== */
    
    function loadHistory() {
        chrome.storage.local.get(['fillHistory'], function(res) {
            var history = res.fillHistory || [];
            renderHistory(history);
        });
    }

    function renderHistory(history) {
        var listEl = document.getElementById('historyList');
        var countEl = document.getElementById('historyCount');
        
        countEl.textContent = history.length;

        if (!history.length) {
            listEl.innerHTML = '<div class="history-empty"><div class="history-empty-icon">📋</div><div>No history yet</div><div style="font-size:11px;margin-top:4px;">Drop a passport PDF to get started</div></div>';
            return;
        }

        var html = '';
        history.slice(0, 50).forEach(function(item) {
            var statusClass = item.success ? 'success' : (item.warnings ? 'warning' : 'error');
            var statusText = item.success ? 'Success' : (item.warnings ? 'Warnings' : 'Error');
            
            html += '<div class="history-item">';
            html += '<div class="history-item-header">';
            html += '<span class="history-item-site">' + escapeHtml(item.site || 'Unknown') + '</span>';
            html += '<span class="history-item-time">' + formatTime(item.timestamp) + '</span>';
            html += '</div>';
            html += '<div class="history-item-data">';
            html += '<dt>Name:</dt><dd>' + escapeHtml(item.name || '-') + '</dd>';
            html += '<dt>Passport:</dt><dd>' + escapeHtml(item.passport || '-') + '</dd>';
            html += '<dt>IIN:</dt><dd>' + escapeHtml(item.iin || '-') + '</dd>';
            html += '</div>';
            html += '<div class="history-item-status ' + statusClass + '">' + statusText;
            if (item.warnings && item.warnings.length) {
                html += ' (' + item.warnings.length + ' warnings)';
            }
            html += '</div></div>';
        });

        listEl.innerHTML = html;
    }

    function formatTime(timestamp) {
        var date = new Date(timestamp);
        var now = new Date();
        var diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);
    }

    function clearHistory() {
        if (confirm('Clear all fill history?')) {
            chrome.storage.local.set({ fillHistory: [] }, function() {
                loadHistory();
            });
        }
    }

    function exportHistory() {
        chrome.storage.local.get(['fillHistory'], function(res) {
            var history = res.fillHistory || [];
            if (!history.length) {
                alert('No history to export');
                return;
            }

            var csv = 'Date,Site,Name,Passport,IIN,Birth Date,Status\n';
            history.forEach(function(item) {
                csv += [
                    new Date(item.timestamp).toISOString(),
                    item.site || '',
                    item.name || '',
                    item.passport || '',
                    item.iin || '',
                    item.birthDate || '',
                    item.success ? 'Success' : 'Error'
                ].join(',') + '\n';
            });

            var blob = new Blob([csv], { type: 'text/csv' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'passport-autofill-history-' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    /* ==================== TOOLS ==================== */
    
    function openToolIinCheck() {
        var iin = prompt('Enter IIN (12 digits):');
        if (!iin) return;

        chrome.runtime.sendMessage({ action: 'validateIIN', iin: iin }, function(result) {
            if (result.valid) {
                var info = result.info;
                alert('IIN Valid!\n\nBirth Date: ' + info.birthDate + '\nGender: ' + (info.gender === '1' ? 'Male' : 'Female'));
            } else {
                alert('Invalid IIN!\n\n' + (result.error || 'Checksum failed'));
            }
        });
    }

    function openToolPassportCheck() {
        var dateStr = prompt('Enter passport expiry date (DD.MM.YYYY):');
        if (!dateStr) return;

        var parts = dateStr.split('.');
        if (parts.length !== 3) {
            alert('Invalid date format. Use DD.MM.YYYY');
            return;
        }

        var expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        var now = new Date();
        var monthsValid = (expiryDate - now) / (1000 * 60 * 60 * 24 * 30);

        if (monthsValid < 0) {
            alert('Passport EXPIRED!\n\nExpired ' + Math.abs(Math.floor(monthsValid)) + ' months ago.');
        } else if (monthsValid < 6) {
            alert('WARNING!\n\nPassport expires in ' + Math.floor(monthsValid) + ' months.\nMany countries require 6+ months validity.');
        } else {
            alert('Passport Valid!\n\nExpires in ' + Math.floor(monthsValid) + ' months.');
        }
    }

    function openToolCalculator() {
        var dateStr = prompt('Enter birth date (DD.MM.YYYY):');
        if (!dateStr) return;

        var parts = dateStr.split('.');
        if (parts.length !== 3) {
            alert('Invalid date format. Use DD.MM.YYYY');
            return;
        }

        var birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
        var now = new Date();
        
        var years = now.getFullYear() - birthDate.getFullYear();
        var months = now.getMonth() - birthDate.getMonth();
        var days = now.getDate() - birthDate.getDate();

        if (days < 0) {
            months--;
            days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        var isChild = years < 18;
        var isInfant = years < 2;

        alert('Age: ' + years + ' years, ' + months + ' months, ' + days + ' days\n\n' +
            'Category: ' + (isInfant ? 'INFANT (under 2)' : (isChild ? 'CHILD (2-17)' : 'ADULT (18+)')));
    }

    function openToolTranslit() {
        var text = prompt('Enter text in Cyrillic:');
        if (!text) return;

        var translitMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
            'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
            'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
            'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };

        var result = '';
        for (var i = 0; i < text.length; i++) {
            var char = text[i].toLowerCase();
            var trans = translitMap[char];
            if (trans !== undefined) {
                result += text[i] === text[i].toUpperCase() ? trans.toUpperCase() : trans;
            } else {
                result += text[i];
            }
        }

        prompt('Transliterated text:', result.toUpperCase());
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(function() {
            showMsg('Copied!');
        });
    }

    /* ==================== UTILITIES ==================== */
    
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

    /* ==================== INIT ==================== */
    
    function init() {
        initTabs();
        loadSettings();

        document.getElementById('email').addEventListener('input', function() { clearError('email'); });
        document.getElementById('phone').addEventListener('input', function() { clearError('phone'); });
        document.getElementById('saveBtn').addEventListener('click', saveSettings);
        document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdate);
        document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

        document.getElementById('toolIinCheck').addEventListener('click', openToolIinCheck);
        document.getElementById('toolPassportCheck').addEventListener('click', openToolPassportCheck);
        document.getElementById('toolCalculator').addEventListener('click', openToolCalculator);
        document.getElementById('toolTranslit').addEventListener('click', openToolTranslit);

        document.getElementById('actionCopyEmail').addEventListener('click', function() {
            chrome.storage.local.get(['defaultEmail'], function(res) {
                if (res.defaultEmail) copyToClipboard(res.defaultEmail);
                else alert('No default email set');
            });
        });

        document.getElementById('actionCopyPhone').addEventListener('click', function() {
            chrome.storage.local.get(['defaultPhone'], function(res) {
                if (res.defaultPhone) copyToClipboard(res.defaultPhone);
                else alert('No default phone set');
            });
        });

        document.getElementById('actionExportHistory').addEventListener('click', exportHistory);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
