if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

(function() {
    'use strict';

    /* ==================== TAB NAVIGATION ==================== */

    function initTabs() {
        document.querySelectorAll('.tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                switchTab(this.getAttribute('data-tab'));
            });
        });
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.tab[data-tab="' + tabId + '"]').classList.add('active');
        document.getElementById(tabId).classList.add('active');
        if (tabId === 'domains') loadDomains();
        if (tabId === 'templates') loadTemplates();
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
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const autoFill = document.getElementById('autoFill').checked;
        let hasError = false;

        const emailInput = document.getElementById('email');
        const emailError = document.getElementById('email-error');

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailInput.classList.add('error');
            emailError.textContent = 'Invalid email format';
            emailError.classList.add('show');
            hasError = true;
        } else {
            emailInput.classList.remove('error');
            emailError.classList.remove('show');
        }

        const phoneInput = document.getElementById('phone');
        const phoneError = document.getElementById('phone-error');
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

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
        const msg = document.getElementById('msg');
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
        const statusEl = document.getElementById('updateStatus');
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
        const btn = document.getElementById('checkUpdateBtn');
        const statusEl = document.getElementById('updateStatus');
        const originalText = btn.textContent;

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

    /* ==================== DOMAINS ==================== */

    function loadDomains() {
        chrome.runtime.sendMessage({ action: 'getDomains' }, function(domains) {
            if (!domains) return;
            renderDomains(domains);
        });
    }

    function renderDomains(domains) {
        const listEl = document.getElementById('domainList');
        if (!listEl) return;

        const defaults = [
            '*://*.fstravel.asia/*', '*://*.fstravel.com/*',
            '*://*.kompastour.kz/*', '*://*.kompastour.com/*',
            '*://*.kazunion.com/*'
        ];

        let html = '';
        domains.forEach(function(d) {
            const isDefault = defaults.includes(d.pattern);
            html += '<div class="domain-item ' + (isDefault ? 'default' : '') + '">';
            html += '<span class="domain-pattern">' + escapeHtml(d.pattern) + '</span>';
            html += '<span class="domain-site">' + escapeHtml(d.siteId) + '</span>';
            html += '<button class="domain-remove" data-pattern="' + escapeHtml(d.pattern) + '">&times;</button>';
            html += '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.domain-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const pattern = this.getAttribute('data-pattern');
                chrome.runtime.sendMessage({ action: 'removeDomain', pattern: pattern }, function(res) {
                    if (res && res.success) renderDomains(res.domains);
                });
            });
        });
    }

    function addDomain() {
        const pattern = document.getElementById('newDomainPattern').value.trim();
        const siteId = document.getElementById('newDomainSite').value;

        if (!pattern || !/^\*:\/\/[^/]+\/\*$/.test(pattern)) {
            showMsg('Invalid pattern. Use *://*.example.com/*', 'error');
            return;
        }

        chrome.runtime.sendMessage({ action: 'addDomain', domain: { pattern: pattern, siteId: siteId } }, function(res) {
            if (res && res.success) {
                document.getElementById('newDomainPattern').value = '';
                renderDomains(res.domains);
                showMsg('Domain added!', 'success');
            } else if (res) {
                showMsg(res.error || 'Failed', 'error');
            }
        });
    }

    /* ==================== TEMPLATES ==================== */

    function loadTemplates() {
        chrome.runtime.sendMessage({ action: 'getTemplates' }, function(templates) {
            renderTemplates(templates || []);
        });
    }

    function renderTemplates(templates) {
        const listEl = document.getElementById('templateList');
        if (!listEl) return;

        if (!templates.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:11px;">No templates saved</div>';
            return;
        }

        let html = '';
        templates.forEach(function(t) {
            html += '<div class="template-item" data-id="' + escapeHtml(t.id) + '">';
            html += '<div class="template-item-name">' + escapeHtml(t.name) + '</div>';
            html += '<div class="template-item-info">' + escapeHtml(t.surname || '') + ' ' + escapeHtml(t.givenName || '') + ' | ' + escapeHtml(t.passport || '') + ' | IIN: ' + escapeHtml(t.iin || '') + '</div>';
            html += '<div class="template-item-actions">';
            html += '<button class="secondary tpl-use-btn" data-id="' + escapeHtml(t.id) + '">Use</button>';
            html += '<button class="danger tpl-del-btn" data-id="' + escapeHtml(t.id) + '">Delete</button>';
            html += '</div>';
            html += '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.tpl-use-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                const tpl = templates.find(t => t.id === id);
                if (tpl) useTemplate(tpl);
            });
        });

        listEl.querySelectorAll('.tpl-del-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                chrome.runtime.sendMessage({ action: 'deleteTemplate', id: id }, function(res) {
                    if (res && res.success) renderTemplates(res.templates);
                });
            });
        });
    }

    function saveTemplate() {
        const name = document.getElementById('tplName').value.trim();
        if (!name) { showMsg('Template name required', 'error'); return; }

        const template = {
            id: 'tpl_' + Date.now(),
            name: name,
            surname: document.getElementById('tplSurname').value.trim(),
            givenName: document.getElementById('tplGivenName').value.trim(),
            passport: document.getElementById('tplPassport').value.trim(),
            iin: document.getElementById('tplIIN').value.trim(),
            birthDate: document.getElementById('tplBirth').value.trim(),
            validDate: document.getElementById('tplValid').value.trim(),
            gender: document.getElementById('tplGender').value,
            email: document.getElementById('tplEmail').value.trim(),
            phone: document.getElementById('tplPhone').value.trim()
        };

        chrome.runtime.sendMessage({ action: 'saveTemplate', template: template }, function(res) {
            if (res && res.success) {
                clearTemplateForm();
                renderTemplates(res.templates);
                showMsg('Template saved!', 'success');
            }
        });
    }

    function clearTemplateForm() {
        ['tplName','tplSurname','tplGivenName','tplPassport','tplIIN','tplBirth','tplValid','tplEmail','tplPhone'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('tplGender').value = '1';
    }

    function useTemplate(template) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'fillTemplate',
                template: template
            }, function(response) {
                if (response && response.success) {
                    showMsg('Template sent to page!', 'success');
                } else {
                    showMsg('No tourist form found on page', 'error');
                }
            });
        });
    }

    /* ==================== TOOLS ==================== */

    function validateIIN() {
        const input = document.getElementById('iinInput');
        const result = document.getElementById('iinResult');
        const iin = input.value.trim();

        if (!iin || iin.length !== 12 || !/^\d{12}$/.test(iin)) {
            input.classList.remove('success', 'warning');
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>IIN must be exactly 12 digits';
            return;
        }

        const validation = PassportParser.validateIINFull(iin);

        if (!validation.valid) {
            input.classList.remove('success', 'warning');
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid IIN</div>' + escapeHtml(validation.error);
            return;
        }

        const info = validation.info;
        const gender = info.gender === '1' ? 'Male' : 'Female';

        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Valid IIN</div>' +
            '<div class="tool-result-data">' +
            '<dt>Birth Date</dt><dd>' + escapeHtml(info.birthDate) + '</dd>' +
            '<dt>Gender</dt><dd>' + gender + '</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + escapeHtml(info.birthDate) + '\')">Copy DOB</button>';
    }

    function checkPassport() {
        const input = document.getElementById('passportExpiry');
        const result = document.getElementById('passportResult');
        const dateStr = input.value.trim();

        const parts = dateStr.split('.');
        if (parts.length !== 3) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>Use DD.MM.YYYY format';
            return;
        }

        const expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const daysValid = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
        const monthsValid = daysValid / 30;

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
            result.innerHTML = '<div class="tool-result-title">PASSPORT EXPIRED</div>Expired ' + Math.abs(Math.floor(daysValid)) + ' days ago';
        } else if (monthsValid < 6) {
            input.classList.add('warning');
            result.className = 'tool-result show warning';
            result.innerHTML = '<div class="tool-result-title">WARNING</div>Expires in ' + Math.floor(daysValid) + ' days (' + Math.floor(monthsValid) + ' months)<br>Many countries require 6+ months validity';
        } else {
            input.classList.add('success');
            result.className = 'tool-result show success';
            result.innerHTML = '<div class="tool-result-title">Valid Passport</div>Expires in ' + Math.floor(monthsValid) + ' months (' + Math.floor(daysValid) + ' days)';
        }
    }

    function calculateAge() {
        const input = document.getElementById('birthDateInput');
        const result = document.getElementById('ageResult');
        const dateStr = input.value.trim();

        const parts = dateStr.split('.');
        if (parts.length !== 3) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Format</div>Use DD.MM.YYYY format';
            return;
        }

        const birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();

        if (isNaN(birthDate.getTime())) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Invalid Date</div>Check date format';
            return;
        }

        let years = now.getFullYear() - birthDate.getFullYear();
        let months = now.getMonth() - birthDate.getMonth();
        let days = now.getDate() - birthDate.getDate();

        if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
        if (months < 0) { years--; months += 12; }

        const category = years >= 18 ? 'ADULT (18+)' : (years >= 2 ? 'CHILD (2-17)' : 'INFANT (0-2)');
        const categoryClass = years >= 18 ? 'success' : (years >= 2 ? 'warning' : 'info');

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
        const input = document.getElementById('cyrillicInput');
        const result = document.getElementById('translitResult');
        const text = input.value.trim();

        if (!text) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Empty Input</div>Enter text to transliterate';
            return;
        }

        const map = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
            'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
            'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
        };

        let trans = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i].toLowerCase();
            const t = map[c];
            if (t !== undefined) {
                trans += text[i] === text[i].toUpperCase() ? t.toUpperCase() : t;
            } else {
                trans += text[i];
            }
        }

        const upper = trans.toUpperCase();
        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Result</div>' +
            '<div style="font-size:13px;font-weight:600;margin:6px 0;">' + escapeHtml(upper) + '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + escapeHtml(upper).replace(/'/g, "\\'") + '\')">Copy</button>';
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

    let currencyRates = { USD: 504.0, EUR: 598.0, RUB: 6.5, UZS: 0.041, KGS: 5.77, AZN: 296.0, date: null };

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
        const container = document.getElementById('currencyRates');
        if (!container) return;

        if (!currencyRates) {
            container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:15px;color:#c62828;">Rates not loaded</div>';
            return;
        }

        let html = '';
        [{ code: 'USD', rate: currencyRates.USD }, { code: 'EUR', rate: currencyRates.EUR }, { code: 'RUB', rate: currencyRates.RUB }].forEach(function(item) {
            html += '<div class="currency-item">';
            html += '<div class="currency-item-code">1 ' + item.code + '</div>';
            html += '<div class="currency-item-rate">' + item.rate.toFixed(2) + ' KZT</div>';
            html += '</div>';
        });

        if (currencyRates.date) html += '<div class="currency-date">Updated: ' + currencyRates.date + '</div>';

        container.innerHTML = html;
    }

    function updateQuickConvert() {
        const usdInput = document.getElementById('quickUSD');
        const eurInput = document.getElementById('quickEUR');
        const rubInput = document.getElementById('quickRUB');

        if (usdInput) usdInput.oninput = function() {
            document.getElementById('quickUSDResult').textContent = '= ' + numberFormat((parseFloat(this.value) || 0) * currencyRates.USD) + ' KZT';
        };
        if (eurInput) eurInput.oninput = function() {
            document.getElementById('quickEURResult').textContent = '= ' + numberFormat((parseFloat(this.value) || 0) * currencyRates.EUR) + ' KZT';
        };
        if (rubInput) rubInput.oninput = function() {
            document.getElementById('quickRUBResult').textContent = '= ' + numberFormat((parseFloat(this.value) || 0) * currencyRates.RUB) + ' KZT';
        };
    }

    function numberFormat(num) { return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

    function calculatePrice() {
        const price = parseFloat(document.getElementById('priceInput').value) || 0;
        const currency = document.getElementById('currencyFrom').value;
        const result = document.getElementById('priceResult');

        if (!price) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>Enter price';
            return;
        }

        const rate = currencyRates[currency];
        if (!rate) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>Rate not available';
            return;
        }

        const kzt = (price * rate).toFixed(0);
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">Result</div>' +
            '<div class="tool-result-data">' +
            '<dt>' + price + ' ' + currency + '</dt><dd>' + numberFormat(kzt) + ' KZT</dd>' +
            '<dt>Rate</dt><dd>1 ' + currency + ' = ' + rate + ' KZT</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + kzt + '\')">Copy KZT</button>';
    }

    function refreshRates() {
        const btn = document.getElementById('refreshRatesBtn');
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

    /* ==================== EXPORT / IMPORT ==================== */

    function exportSettings() {
        chrome.runtime.sendMessage({ action: 'exportSettings' }, function(resp) {
            if (!resp || !resp.data) { showMsg('Export failed', 'error'); return; }
            const blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'passport-autofill-settings-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    function importSettings() {
        document.getElementById('importFile').click();
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const settings = JSON.parse(ev.target.result);
                chrome.runtime.sendMessage({ action: 'importSettings', settings: settings }, function(res) {
                    if (res && res.success) {
                        showMsg('Settings imported!', 'success');
                        loadSettings();
                    } else {
                        showMsg(res ? res.error : 'Import failed', 'error');
                    }
                });
            } catch (err) {
                showMsg('Invalid JSON file', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    /* ==================== UTILITIES ==================== */

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
        });
    }

    /* ==================== INIT ==================== */

    function init() {
        initTabs();
        loadSettings();

        document.getElementById('saveBtn').addEventListener('click', saveSettings);
        document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdate);
        document.getElementById('addDomainBtn').addEventListener('click', addDomain);
        document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplate);
        document.getElementById('exportBtn').addEventListener('click', exportSettings);
        document.getElementById('importBtn').addEventListener('click', importSettings);
        document.getElementById('importFile').addEventListener('change', handleImportFile);

        document.getElementById('validateIinBtn').addEventListener('click', validateIIN);
        document.getElementById('checkPassportBtn').addEventListener('click', checkPassport);
        document.getElementById('calcAgeBtn').addEventListener('click', calculateAge);
        document.getElementById('translitBtn').addEventListener('click', transliterate);

        document.getElementById('copyEmailBtn').addEventListener('click', copyDefaultEmail);
        document.getElementById('copyPhoneBtn').addEventListener('click', copyDefaultPhone);

        document.getElementById('iinInput').addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 12);
        });
        document.getElementById('iinInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') validateIIN(); });
        document.getElementById('passportExpiry').addEventListener('keypress', function(e) { if (e.key === 'Enter') checkPassport(); });
        document.getElementById('birthDateInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') calculateAge(); });
        document.getElementById('cyrillicInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') transliterate(); });

        document.getElementById('calcPriceBtn').addEventListener('click', calculatePrice);
        document.getElementById('refreshRatesBtn').addEventListener('click', refreshRates);
        document.getElementById('priceInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') calculatePrice(); });

        loadCurrencyRates();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
