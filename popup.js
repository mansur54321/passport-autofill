/**
 * Popup Script
 * Handles extension popup UI, settings, history, and tools
 */

// Firefox compatibility
if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

(function() {
    'use strict';

    /* ==================== TAB NAVIGATION ==================== */
    
    function initTabs() {
        document.querySelectorAll('.tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                var tabId = this.getAttribute('data-tab');
                switchTab(tabId);
            });
        });
    }
    
    function switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        document.querySelector('.tab[data-tab="' + tabId + '"]').classList.add('active');
        document.getElementById(tabId).classList.add('active');
        if (tabId === 'history') loadHistory();
        if (tabId === 'price') loadCurrencyRates();
    }

    /* ==================== SETTINGS ==================== */
    
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
        var hasError = false;

        var emailInput = document.getElementById('email');
        var emailError = document.getElementById('email-error');
        
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailInput.classList.add('error');
            emailError.textContent = 'Invalid email format';
            emailError.classList.add('show');
            hasError = true;
        } else {
            emailInput.classList.remove('error');
            emailError.classList.remove('show');
        }

        var phoneInput = document.getElementById('phone');
        var phoneError = document.getElementById('phone-error');
        var cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        
        if (phone && !/^\d{10,12}$/.test(cleanPhone)) {
            phoneInput.classList.add('error');
            phoneError.textContent = 'Enter 10-12 digits';
            phoneError.classList.add('show');
            hasError = true;
        } else {
            phoneInput.classList.remove('error');
            phoneError.classList.remove('show');
        }

        if (hasError) return;

        chrome.storage.local.set({
            defaultEmail: email,
            defaultPhone: cleanPhone,
            autoFill: autoFill
        }, function() {
            showMsg('Saved!', 'success');
        });
    }

    function showMsg(text, type) {
        var msg = document.getElementById('msg');
        msg.textContent = text;
        msg.className = 'msg ' + (type || 'info');
        setTimeout(function() { msg.className = 'msg'; }, 2000);
    }

    /* ==================== UPDATE STATUS ==================== */
    
    function loadUpdateStatus() {
        chrome.runtime.sendMessage({ action: 'getUpdateStatus' }, function(status) {
            if (status) displayUpdateStatus(status);
        });
    }

    function displayUpdateStatus(status) {
        var statusEl = document.getElementById('updateStatus');
        if (!statusEl || !status) return;

        if (status.error) {
            statusEl.className = 'update-status error';
            statusEl.innerHTML = 'Error: ' + escapeHtml(status.error);
        } else if (status.hasUpdate) {
            statusEl.className = 'update-status available';
            statusEl.innerHTML = 'Update available! <a href="https://github.com/mansur54321/passport-autofill/releases/latest" target="_blank">Download v' + escapeHtml(status.latestVersion) + '</a>';
        } else if (status.latestVersion) {
            statusEl.className = 'update-status uptodate';
            statusEl.innerHTML = 'Up to date (v' + escapeHtml(status.latestVersion) + ')';
        }
    }

    function checkForUpdate() {
        var btn = document.getElementById('checkUpdateBtn');
        var statusEl = document.getElementById('updateStatus');
        var originalText = btn.textContent;

        btn.textContent = 'Checking...';
        btn.disabled = true;
        statusEl.className = 'update-status checking';
        statusEl.innerHTML = 'Checking for updates...';

        chrome.runtime.sendMessage({ action: 'checkUpdate' }, function(response) {
            btn.textContent = originalText;
            btn.disabled = false;
            if (response) displayUpdateStatus(response);
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
            listEl.innerHTML = '<div class="history-empty"><div class="history-empty-icon">📋</div><div>No history yet</div></div>';
            return;
        }

        var html = '';
        history.slice(0, 50).forEach(function(item) {
            var statusClass = item.success ? 'success' : (item.warnings && item.warnings.length ? 'warning' : 'error');
            var statusText = item.success ? 'Success' : (item.warnings && item.warnings.length ? item.warnings.length + ' warnings' : 'Error');
            
            html += '<div class="history-item">';
            html += '<div class="history-item-header">';
            html += '<span class="history-item-site">' + escapeHtml(item.site || 'Unknown') + '</span>';
            html += '<span class="history-item-time">' + formatTime(item.timestamp) + '</span>';
            html += '</div>';
            html += '<div class="history-item-data">';
            html += '<dt>Name</dt><dd>' + escapeHtml(item.name || '-') + '</dd>';
            html += '<dt>Passport</dt><dd>' + escapeHtml(item.passport || '-') + '</dd>';
            html += '<dt>IIN</dt><dd>' + escapeHtml(item.iin || '-') + '</dd>';
            html += '</div>';
            html += '<span class="history-item-status ' + statusClass + '">' + statusText + '</span>';
            html += '</div>';
        });

        listEl.innerHTML = html;
    }

    function formatTime(timestamp) {
        var date = new Date(timestamp);
        var now = new Date();
        var diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return date.toLocaleDateString();
    }

    function clearHistory() {
        if (confirm('Clear all history?')) {
            chrome.storage.local.set({ fillHistory: [] }, loadHistory);
        }
    }

    function exportHistory() {
        chrome.storage.local.get(['fillHistory'], function(res) {
            var history = res.fillHistory || [];
            if (!history.length) {
                showMsg('No history to export', 'error');
                return;
            }

            var csv = 'Date,Site,Name,Passport,IIN,BirthDate,Status\n';
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
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'passport-history-' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
        });
    }

    /* ==================== TOOLS ==================== */
    
    function validateIIN() {
        var input = document.getElementById('iinInput');
        var result = document.getElementById('iinResult');
        var iin = input.value.trim();

        if (!iin || iin.length !== 12 || !/^\d{12}$/.test(iin)) {
            input.classList.remove('success', 'warning');
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>IIN must be exactly 12 digits';
            return;
        }

        var weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        var weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
        var sum1 = 0;
        for (var i = 0; i < 11; i++) sum1 += parseInt(iin[i]) * weights1[i];
        var checkDigit = sum1 % 11;
        
        if (checkDigit === 10) {
            var sum2 = 0;
            for (var j = 0; j < 11; j++) sum2 += parseInt(iin[j]) * weights2[j];
            checkDigit = sum2 % 11;
        }

        if (checkDigit !== parseInt(iin[11])) {
            input.classList.remove('success', 'warning');
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid IIN</div>Checksum validation failed';
            return;
        }

        var century = parseInt(iin[6]);
        var yearPrefix = century <= 2 ? '18' : (century <= 4 ? '19' : '20');
        var year = yearPrefix + iin.substring(0, 2);
        var month = iin.substring(2, 4);
        var day = iin.substring(4, 6);
        var gender = (century % 2 === 1) ? 'Male' : 'Female';

        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Valid IIN</div>' +
            '<div class="tool-result-data">' +
            '<dt>Birth Date</dt><dd>' + day + '.' + month + '.' + year + '</dd>' +
            '<dt>Gender</dt><dd>' + gender + '</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + day + '.' + month + '.' + year + '\')">Copy DOB</button>';
    }

    function checkPassport() {
        var input = document.getElementById('passportExpiry');
        var result = document.getElementById('passportResult');
        var dateStr = input.value.trim();

        var parts = dateStr.split('.');
        if (parts.length !== 3) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>Use DD.MM.YYYY format';
            return;
        }

        var expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var daysValid = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
        var monthsValid = daysValid / 30;

        if (isNaN(daysValid) || expiryDate.toString() === 'Invalid Date') {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Date</div>Check date format';
            return;
        }

        input.classList.remove('error');

        if (daysValid < 0) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">PASSPORT EXPIRED</div>' +
                'Expired ' + Math.abs(Math.floor(daysValid)) + ' days ago';
        } else if (monthsValid < 6) {
            input.classList.add('warning');
            result.className = 'tool-result show warning';
            result.innerHTML = '<div class="tool-result-title">WARNING</div>' +
                'Expires in ' + Math.floor(daysValid) + ' days (' + Math.floor(monthsValid) + ' months)<br>' +
                'Many countries require 6+ months validity';
        } else {
            input.classList.add('success');
            result.className = 'tool-result show success';
            result.innerHTML = '<div class="tool-result-title">Valid Passport</div>' +
                'Expires in ' + Math.floor(monthsValid) + ' months (' + Math.floor(daysValid) + ' days)';
        }
    }

    function calculateAge() {
        var input = document.getElementById('birthDateInput');
        var result = document.getElementById('ageResult');
        var dateStr = input.value.trim();

        var parts = dateStr.split('.');
        if (parts.length !== 3) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>Use DD.MM.YYYY format';
            return;
        }

        var birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
        var now = new Date();
        
        if (isNaN(birthDate.getTime())) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Date</div>Check date format';
            return;
        }

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

        var category = years >= 18 ? 'ADULT (18+)' : (years >= 2 ? 'CHILD (2-17)' : 'INFANT (0-2)');
        var categoryClass = years >= 18 ? 'success' : (years >= 2 ? 'warning' : 'info');

        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show ' + categoryClass;
        result.innerHTML = '<div class="tool-result-title">' + years + ' years, ' + months + ' months</div>' +
            '<div class="tool-result-data">' +
            '<dt>Age</dt><dd>' + years + 'y ' + months + 'm ' + days + 'd</dd>' +
            '<dt>Category</dt><dd>' + category + '</dd>' +
            '</div>';
    }

    function transliterate() {
        var input = document.getElementById('cyrillicInput');
        var result = document.getElementById('translitResult');
        var text = input.value.trim();

        if (!text) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Empty Input</div>Enter text to transliterate';
            return;
        }

        var map = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
            'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
            'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
        };

        var trans = '';
        for (var i = 0; i < text.length; i++) {
            var c = text[i].toLowerCase();
            var t = map[c];
            if (t !== undefined) {
                trans += text[i] === text[i].toUpperCase() ? t.toUpperCase() : t;
            } else {
                trans += text[i];
            }
        }

        var upper = trans.toUpperCase();
        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Result</div>' +
            '<div style="font-size:14px;font-weight:600;margin:8px 0;">' + escapeHtml(upper) + '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + escapeHtml(upper) + '\')">Copy</button>';
    }

    function copyDefaultEmail() {
        chrome.storage.local.get(['defaultEmail'], function(res) {
            if (res.defaultEmail) {
                navigator.clipboard.writeText(res.defaultEmail);
                showMsg('Email copied!', 'success');
            } else {
                showMsg('No email set', 'error');
            }
        });
    }

    function copyDefaultPhone() {
        chrome.storage.local.get(['defaultPhone'], function(res) {
            if (res.defaultPhone) {
                navigator.clipboard.writeText(res.defaultPhone);
                showMsg('Phone copied!', 'success');
            } else {
                showMsg('No phone set', 'error');
            }
        });
    }

    /* ==================== CURRENCY RATES ==================== */
    
    var currencyRates = {
        USD: 504.0,
        EUR: 598.0,
        RUB: 6.5,
        UZS: 0.041,
        KGS: 5.77,
        AZN: 296.0,
        date: null
    };
    
    function loadCurrencyRates() {
        chrome.storage.local.get(['currencyRates', 'currencyRatesDate'], function(res) {
            if (res.currencyRates) {
                currencyRates = res.currencyRates;
                currencyRates.date = res.currencyRatesDate;
            }
            displayCurrencyRates();
            updateQuickConvert();
        });
        
        chrome.runtime.sendMessage({ action: 'getCurrencyRates' }, function(rates) {
            if (rates) {
                currencyRates = rates;
                displayCurrencyRates();
                updateQuickConvert();
            }
        });
    }
    
    function displayCurrencyRates() {
        var container = document.getElementById('currencyRates');
        if (!container) return;
        
        if (!currencyRates) {
            container.innerHTML = '<div class="currency-error">Rates not loaded</div>';
            return;
        }
        
        var html = '';
        var mainRates = [
            { code: 'USD', rate: currencyRates.USD },
            { code: 'EUR', rate: currencyRates.EUR },
            { code: 'RUB', rate: currencyRates.RUB }
        ];
        
        mainRates.forEach(function(item) {
            html += '<div class="currency-item">';
            html += '<div class="currency-item-code">1 ' + item.code + '</div>';
            html += '<div class="currency-item-rate">' + item.rate.toFixed(2) + ' KZT</div>';
            html += '</div>';
        });
        
        if (currencyRates.date) {
            html += '<div class="currency-date">Updated: ' + currencyRates.date + '</div>';
        }
        
        container.innerHTML = html;
    }
    
    function updateQuickConvert() {
        var usdInput = document.getElementById('quickUSD');
        var eurInput = document.getElementById('quickEUR');
        var rubInput = document.getElementById('quickRUB');
        
        if (usdInput) {
            usdInput.addEventListener('input', function() {
                var val = parseFloat(this.value) || 0;
                var result = (val * currencyRates.USD).toFixed(0);
                document.getElementById('quickUSDResult').textContent = '= ' + numberFormat(result) + ' KZT';
            });
        }
        
        if (eurInput) {
            eurInput.addEventListener('input', function() {
                var val = parseFloat(this.value) || 0;
                var result = (val * currencyRates.EUR).toFixed(0);
                document.getElementById('quickEURResult').textContent = '= ' + numberFormat(result) + ' KZT';
            });
        }
        
        if (rubInput) {
            rubInput.addEventListener('input', function() {
                var val = parseFloat(this.value) || 0;
                var result = (val * currencyRates.RUB).toFixed(0);
                document.getElementById('quickRUBResult').textContent = '= ' + numberFormat(result) + ' KZT';
            });
        }
    }
    
    function numberFormat(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    
    function calculatePrice() {
        var price = parseFloat(document.getElementById('priceInput').value) || 0;
        var currency = document.getElementById('currencyFrom').value;
        var result = document.getElementById('priceResult');
        
        if (!price) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>Enter price';
            return;
        }
        
        var rate = currencyRates[currency];
        if (!rate) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>Rate not available';
            return;
        }
        
        var kzt = (price * rate).toFixed(0);
        
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Result</div>' +
            '<div class="tool-result-data">' +
            '<dt>' + price + ' ' + currency + '</dt><dd>' + numberFormat(kzt) + ' KZT</dd>' +
            '<dt>Rate</dt><dd>1 ' + currency + ' = ' + rate + ' KZT</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + kzt + '\')">Copy KZT</button>';
    }
    
    function refreshRates() {
        var btn = document.getElementById('refreshRatesBtn');
        btn.textContent = 'Refreshing...';
        btn.disabled = true;
        
        chrome.runtime.sendMessage({ action: 'fetchCurrencyRates' }, function(rates) {
            btn.textContent = 'Refresh Rates';
            btn.disabled = false;
            if (rates) {
                currencyRates = rates;
                displayCurrencyRates();
                updateQuickConvert();
                showMsg('Rates updated!', 'success');
            }
        });
    }

    /* ==================== UTILITIES ==================== */
    
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
        });
    }

    /* ==================== INIT ==================== */
    
    function init() {
        initTabs();
        loadSettings();

        document.getElementById('saveBtn').addEventListener('click', saveSettings);
        document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdate);
        document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
        document.getElementById('exportHistoryBtn').addEventListener('click', exportHistory);

        document.getElementById('validateIinBtn').addEventListener('click', validateIIN);
        document.getElementById('checkPassportBtn').addEventListener('click', checkPassport);
        document.getElementById('calcAgeBtn').addEventListener('click', calculateAge);
        document.getElementById('translitBtn').addEventListener('click', transliterate);

        document.getElementById('copyEmailBtn').addEventListener('click', copyDefaultEmail);
        document.getElementById('copyPhoneBtn').addEventListener('click', copyDefaultPhone);

        document.getElementById('iinInput').addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 12);
        });
        document.getElementById('iinInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') validateIIN();
        });

        document.getElementById('passportExpiry').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') checkPassport();
        });

        document.getElementById('birthDateInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') calculateAge();
        });

        document.getElementById('cyrillicInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') transliterate();
        });

        document.getElementById('calcPriceBtn').addEventListener('click', calculatePrice);
        document.getElementById('refreshRatesBtn').addEventListener('click', refreshRates);
        document.getElementById('priceInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') calculatePrice();
        });
        
        loadCurrencyRates();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
