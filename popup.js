if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

(function() {
    'use strict';

    /* ==================== SEASONAL THEME ==================== */

    function applySeasonalTheme() {
        var month = new Date().getMonth();
        var themes = {
            winter: { c1: '#5b7a8c', c2: '#7a98aa', c3: '#a8c4d4', bg: '#f0f4f7' },
            spring: { c1: '#7a9a56', c2: '#9ab87a', c3: '#bcd49c', bg: '#f4f7f0' },
            summer: { c1: '#c66b3d', c2: '#d4884f', c3: '#e0a574', bg: '#faf5ec' },
            autumn: { c1: '#a0522d', c2: '#b8854f', c3: '#d4a06a', bg: '#f5ede0' }
        };
        var season;
        if (month <= 1 || month === 11) season = themes.winter;
        else if (month >= 2 && month <= 4) season = themes.spring;
        else if (month >= 5 && month <= 7) season = themes.summer;
        else season = themes.autumn;

        var root = document.documentElement;
        root.style.setProperty('--season-1', season.c1);
        root.style.setProperty('--season-2', season.c2);
        root.style.setProperty('--season-3', season.c3);
        if (!window.matchMedia('(prefers-color-scheme: dark)').matches) {
            root.style.setProperty('--season-bg', season.bg);
        }
    }

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
        if (tabId === 'settings') loadDomains();
        if (tabId === 'templates') loadTemplates();
        if (tabId === 'price') loadCurrencyRates();
        if (tabId === 'history') loadHistory();
    }

    /* ==================== SETTINGS ==================== */

    function loadSettings() {
        chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill', 'language', 'rateSource'], function(res) {
            if (res.defaultEmail) document.getElementById('email').value = res.defaultEmail;
            if (res.defaultPhone) document.getElementById('phone').value = res.defaultPhone;
            document.getElementById('autoFill').checked = res.autoFill || false;
            var lang = res.language || 'ru';
            setLang(lang);
            document.getElementById('langRu').classList.toggle('active', lang === 'ru');
            document.getElementById('langEn').classList.toggle('active', lang === 'en');
            if (res.rateSource) document.getElementById('rateSourceSelect').value = res.rateSource;
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
            emailError.textContent = t('invalid_format');
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
            phoneError.textContent = t('phone_hint');
            phoneError.classList.add('show');
            hasError = true;
        } else {
            phoneInput.classList.remove('error');
            phoneError.classList.remove('show');
        }

        if (hasError) return;

        var rateSource = document.getElementById('rateSourceSelect') ? document.getElementById('rateSourceSelect').value : 'auto';

        chrome.storage.local.set({
            defaultEmail: email,
            defaultPhone: cleanPhone,
            autoFill: autoFill,
            rateSource: rateSource
        }, function() {
            showMsg(t('saved'), 'success');
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
            statusEl.innerHTML = escapeHtml(status.error);
        } else if (status.hasUpdate) {
            statusEl.className = 'update-status available';
            statusEl.innerHTML = t('update_available') + ' <a href="https://github.com/mansur54321/passport-autofill/releases/latest" target="_blank">' + t('download') + ' v' + escapeHtml(status.latestVersion) + '</a>';
        } else if (status.latestVersion) {
            statusEl.className = 'update-status uptodate';
            statusEl.innerHTML = t('up_to_date') + ' (v' + escapeHtml(status.latestVersion) + ')';
        }
    }

    function checkForUpdate() {
        var btn = document.getElementById('checkUpdateBtn');
        var statusEl = document.getElementById('updateStatus');
        var originalText = btn.textContent;

        btn.textContent = t('checking');
        btn.disabled = true;
        statusEl.className = 'update-status checking';
        statusEl.innerHTML = t('checking');

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
        var listEl = document.getElementById('domainList');
        if (!listEl) return;

        var defaults = [
            '*://*.fstravel.asia/*', '*://*.fstravel.com/*',
            '*://*.kompastour.kz/*', '*://*.kompastour.com/*',
            '*://*.kazunion.com/*',
            '*://*.joinup.kz/*', '*://*.anextour.kz/*',
            '*://*.selfietravel.kz/*', '*://*.pegast.asia/*',
            '*://*.sanat.kz/*', '*://*.abktourism.kz/*'
        ];

        var html = '';
        domains.forEach(function(d) {
            var isDefault = defaults.includes(d.pattern);
            html += '<div class="domain-item ' + (isDefault ? 'default' : '') + '">';
            html += '<span class="domain-pattern">' + escapeHtml(d.pattern) + '</span>';
            html += '<span class="domain-site">' + escapeHtml(d.siteId) + '</span>';
            html += '<button class="domain-remove" data-pattern="' + escapeHtml(d.pattern) + '">&times;</button>';
            html += '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.domain-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pattern = this.getAttribute('data-pattern');
                chrome.runtime.sendMessage({ action: 'removeDomain', pattern: pattern }, function(res) {
                    if (res && res.success) renderDomains(res.domains);
                });
            });
        });
    }

    function addDomain() {
        var pattern = document.getElementById('newDomainPattern').value.trim();
        var siteId = document.getElementById('newDomainSite').value;

        if (!pattern || !/^\*:\/\/[^/]+\/\*$/.test(pattern)) {
            showMsg(t('invalid_pattern'), 'error');
            return;
        }

        chrome.runtime.sendMessage({ action: 'addDomain', domain: { pattern: pattern, siteId: siteId } }, function(res) {
            if (res && res.success) {
                document.getElementById('newDomainPattern').value = '';
                renderDomains(res.domains);
                showMsg(t('domain_added'), 'success');
            } else if (res) {
                showMsg(res.error || t('already_exists'), 'error');
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
        var listEl = document.getElementById('templateList');
        if (!listEl) return;

        if (!templates.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--season-text-muted);font-size:11px;">' + escapeHtml(t('no_templates')) + '</div>';
            return;
        }

        var html = '';
        templates.forEach(function(tpl) {
            html += '<div class="template-item" data-id="' + escapeHtml(tpl.id) + '">';
            html += '<div class="template-item-name">' + escapeHtml(tpl.name) + '</div>';
            html += '<div class="template-item-info">' + escapeHtml(tpl.surname || '') + ' ' + escapeHtml(tpl.givenName || '') + ' | ' + escapeHtml(tpl.passport || '') + ' | IIN: ' + escapeHtml(tpl.iin || '') + '</div>';
            html += '<div class="template-item-actions">';
            html += '<button class="secondary tpl-use-btn" data-id="' + escapeHtml(tpl.id) + '">' + escapeHtml(t('use')) + '</button>';
            html += '<button class="danger tpl-del-btn" data-id="' + escapeHtml(tpl.id) + '">' + escapeHtml(t('delete')) + '</button>';
            html += '</div>';
            html += '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.tpl-use-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = this.getAttribute('data-id');
                var tpl = templates.find(function(t) { return t.id === id; });
                if (tpl) useTemplate(tpl);
            });
        });

        listEl.querySelectorAll('.tpl-del-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = this.getAttribute('data-id');
                chrome.runtime.sendMessage({ action: 'deleteTemplate', id: id }, function(res) {
                    if (res && res.success) renderTemplates(res.templates);
                });
            });
        });
    }

    function saveTemplate() {
        var name = document.getElementById('tplName').value.trim();
        if (!name) { showMsg(t('template_name_required'), 'error'); return; }

        var template = {
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
                showToast(t('template_saved'));
            } else {
                showToast('Save failed: ' + (res ? res.error : 'unknown'));
            }
        });
    }

    function clearTemplateForm() {
        ['tplName','tplSurname','tplGivenName','tplPassport','tplIIN','tplBirth','tplValid','tplEmail','tplPhone'].forEach(function(id) {
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
                    showToast(t('template_sent'));
                } else {
                    showToast(t('no_form'));
                }
            });
        });
    }

    /* ==================== PDF IN TEMPLATES ==================== */

    function initPdfDrop() {
        var dropZone = document.getElementById('tplPdfDrop');
        var fileInput = document.getElementById('tplPdfInput');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', function() { fileInput.click(); });

        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            var file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf' || file.type.startsWith('image/')) parsePdfToTemplate(file);
        });

        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file && file.type === 'application/pdf' || file.type.startsWith('image/')) parsePdfToTemplate(file);
            e.target.value = '';
        });
    }

    async function parsePdfToTemplate(file) {
        try {
            var fullText = '';
            if (file.type.startsWith('image/')) {
                // Image OCR — use Tesseract from CDN
                showToast('Scanning photo...');
                var img = new Image();
                img.src = URL.createObjectURL(file);
                await new Promise(function(resolve, reject) { img.onload = resolve; img.onerror = reject; });
                
                // Load Tesseract from CDN
                if (typeof Tesseract === 'undefined') {
                    var script = document.createElement('script');
                    script.src = chrome.runtime.getURL('lib/tesseract.min.js');
                    await new Promise(function(resolve, reject) { script.onload = resolve; script.onerror = reject; });
                    document.head.appendChild(script);
                }
                
                var worker = await Tesseract.createWorker('eng');
                var result = await worker.recognize(img);
                await worker.terminate();
                fullText = result.data.text;
                URL.revokeObjectURL(img.src);
            } else {
                var pdfjs = window.pdfjsLib || self.pdfjsLib || globalThis.pdfjsLib;
                if (!pdfjs) {
                    showToast('PDF library not loaded');
                    return;
                }
                if (pdfjs.GlobalWorkerOptions) {
                    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
                }
                var arrayBuffer = await file.arrayBuffer();
                var pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
                var page = await pdf.getPage(1);
                var textContent = await page.getTextContent();
                fullText = textContent.items.map(function(item) { return item.str; }).join('\n');
                await pdf.destroy();
            }

            var parsed = PassportParser.parse(fullText);

            if (parsed.surname) document.getElementById('tplSurname').value = parsed.surname;
            if (parsed.name) document.getElementById('tplGivenName').value = parsed.name;
            if (parsed.number) document.getElementById('tplPassport').value = parsed.number;
            if (parsed.iin) document.getElementById('tplIIN').value = parsed.iin;
            if (parsed.birthDate) document.getElementById('tplBirth').value = parsed.birthDate;
            if (parsed.validDate) document.getElementById('tplValid').value = parsed.validDate;
            if (parsed.gender) document.getElementById('tplGender').value = parsed.gender;

            chrome.storage.local.get(['defaultEmail', 'defaultPhone'], function(res) {
                if (res.defaultEmail) document.getElementById('tplEmail').value = res.defaultEmail;
                if (res.defaultPhone) document.getElementById('tplPhone').value = res.defaultPhone;
            });

            if (parsed.name || parsed.surname) {
                showToast(t('saved'));
            } else {
                showMsg('PDF: no data found', 'error');
            }
        } catch (err) {
            console.error('[PassportAutoFill] Template PDF parse error:', err);
            showMsg('PDF parse error: ' + (err.message || ''), 'error');
        }
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
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_format') + '</div>' + t('iin_12');
            return;
        }

        var validation = PassportParser.validateIINFull(iin);

        if (!validation.valid) {
            input.classList.remove('success', 'warning');
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_iin') + '</div>' + escapeHtml(validation.error);
            return;
        }

        var info = validation.info;
        var genderText = info.gender === '1' ? t('male') : t('female');

        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">' + t('valid_iin') + '</div>' +
            '<div class="tool-result-data">' +
            '<dt>' + t('birth_date_short') + '</dt><dd>' + escapeHtml(info.birthDate) + '</dd>' +
            '<dt>' + t('gender') + '</dt><dd>' + escapeHtml(genderText) + '</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + escapeHtml(info.birthDate) + '\')">' + t('copy') + '</button>';
    }

    function checkPassport() {
        var input = document.getElementById('passportExpiry');
        var result = document.getElementById('passportResult');
        var country = document.getElementById('passportCountry').value;
        var dateStr = input.value.trim();

        var parts = dateStr.split('.');
        if (parts.length !== 3) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_format') + '</div>DD.MM.YYYY';
            return;
        }

        var validation = PassportParser.validatePassportExpiry(dateStr, country);

        if (!validation.valid) {
            var isExpired = validation.monthsValid !== undefined && validation.monthsValid < 0;
            input.classList.remove('success', 'warning');
            input.classList.add(isExpired ? 'error' : 'warning');
            result.className = 'tool-result show ' + (isExpired ? 'error' : 'warning');
            result.innerHTML = '<div class="tool-result-title">' + (isExpired ? t('passport_expired') : t('passport_expires_warning')) + '</div>' + escapeHtml(validation.message);
        } else {
            input.classList.remove('error', 'warning');
            input.classList.add('success');
            result.className = 'tool-result show success';
            result.innerHTML = '<div class="tool-result-title">' + t('valid_passport') + '</div>' + escapeHtml(validation.message);
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
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_format') + '</div>DD.MM.YYYY';
            return;
        }

        var birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
        var now = new Date();

        if (isNaN(birthDate.getTime())) {
            input.classList.add('error');
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_format') + '</div>';
            return;
        }

        var years = now.getFullYear() - birthDate.getFullYear();
        var months = now.getMonth() - birthDate.getMonth();
        var days = now.getDate() - birthDate.getDate();

        if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
        if (months < 0) { years--; months += 12; }

        var category = years >= 18 ? t('adult') : (years >= 2 ? t('child') : t('infant'));
        var categoryClass = years >= 18 ? 'success' : (years >= 2 ? 'warning' : 'info');

        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show ' + categoryClass;
        result.innerHTML = '<div class="tool-result-title">' + years + ' ' + t('months') + ', ' + months + '</div>' +
            '<div class="tool-result-data">' +
            '<dt>' + t('age_calc') + '</dt><dd>' + years + 'y ' + months + 'm ' + days + 'd</dd>' +
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
            result.innerHTML = '<div class="tool-result-title">' + t('invalid_format') + '</div>';
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
            var tr = map[c];
            if (tr !== undefined) {
                trans += text[i] === text[i].toUpperCase() ? tr.toUpperCase() : tr;
            } else {
                trans += text[i];
            }
        }

        var upper = trans.toUpperCase();
        input.classList.remove('error', 'warning');
        input.classList.add('success');
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">' + t('result') + '</div>' +
            '<div style="font-size:13px;font-weight:600;margin:6px 0;">' + escapeHtml(upper) + '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + escapeHtml(upper).replace(/'/g, "\\'") + '\')">' + t('copy') + '</button>';
    }

    function copyDefaultEmail() {
        chrome.storage.local.get(['defaultEmail'], function(res) {
            if (res.defaultEmail) {
                navigator.clipboard.writeText(res.defaultEmail);
                showMsg(t('email_copied'), 'success');
            } else {
                showMsg(t('no_email'), 'error');
            }
        });
    }

    function copyDefaultPhone() {
        chrome.storage.local.get(['defaultPhone'], function(res) {
            if (res.defaultPhone) {
                navigator.clipboard.writeText(res.defaultPhone);
                showMsg(t('phone_copied'), 'success');
            } else {
                showMsg(t('no_phone'), 'error');
            }
        });
    }

    /* ==================== CURRENCY RATES ==================== */

    var currencyRates = { USD: 504.0, EUR: 598.0, RUB: 6.5, UZS: 0.041, KGS: 5.77, AZN: 296.0, GEL: 186.0, TRY: 15.0, THB: 14.0, AED: 137.0, CNY: 69.0, INR: 6.0, VND: 0.02, MYR: 107.0, IDR: 0.031, MVR: 32.0, date: null };

    function loadCurrencyRates() {
        chrome.storage.local.get(['currencyRates', 'currencyRatesDate', 'rateSource'], function(res) {
            if (res.currencyRates) {
                currencyRates = res.currencyRates;
                currencyRates.date = res.currencyRatesDate;
            }
            if (res.rateSource) document.getElementById('rateSourceSelect').value = res.rateSource;
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

        if (!currencyRates || !currencyRates.USD) {
            container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:15px;color:var(--text-muted);font-size:11px;">' + t('rates_not_loaded') + '<br><span style="font-size:9px;">Open any operator page to auto-extract rates</span></div>';
            return;
        }

        var html = '';
        var currencies = [
            { code: 'USD', rate: currencyRates.USD },
            { code: 'EUR', rate: currencyRates.EUR },
            { code: 'RUB', rate: currencyRates.RUB }
        ];
        currencies.forEach(function(item) {
            if (!item.rate) return;
            html += '<div class="currency-item">';
            html += '<div class="currency-item-code">1 ' + item.code + '</div>';
            html += '<div class="currency-item-rate">' + parseFloat(item.rate).toFixed(2) + ' KZT</div>';
            html += '</div>';
        });

        if (currencyRates.date) html += '<div class="currency-date">Updated: ' + escapeHtml(currencyRates.date) + (currencyRates.source ? ' (' + escapeHtml(currencyRates.source) + ')' : '') + '</div>';

        container.innerHTML = html;
    }

    function updateQuickConvert() {
        var usdInput = document.getElementById('quickUSD');
        var eurInput = document.getElementById('quickEUR');
        var rubInput = document.getElementById('quickRUB');

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

    function numberFormat(num) {
        num = parseFloat(num) || 0;
        return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function calculatePrice() {
        var price = parseFloat(document.getElementById('priceInput').value) || 0;
        var currency = document.getElementById('currencyFrom').value;
        var result = document.getElementById('priceResult');

        if (!price) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>' + t('enter_price_err');
            return;
        }

        var rate = currencyRates[currency];
        if (!rate) {
            result.className = 'tool-result show error';
            result.innerHTML = '<div class="tool-result-title">Error</div>' + t('rate_not_available');
            return;
        }

        var kzt = (price * rate).toFixed(0);
        result.className = 'tool-result show success';
        result.innerHTML = '<div class="tool-result-title">' + t('result') + '</div>' +
            '<div class="tool-result-data">' +
            '<dt>' + price + ' ' + currency + '</dt><dd>' + numberFormat(kzt) + ' KZT</dd>' +
            '<dt>Rate</dt><dd>1 ' + currency + ' = ' + rate + ' KZT</dd>' +
            '</div>' +
            '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' + kzt + '\')">' + t('copy') + '</button>';
    }

    function refreshRates() {
        var btn = document.getElementById('refreshRatesBtn');
        var source = document.getElementById('rateSourceSelect') ? document.getElementById('rateSourceSelect').value : 'nbkz';
        btn.textContent = '...';
        btn.disabled = true;

        chrome.storage.local.set({ rateSource: source });

        if (source === 'nbkz') {
            // Use API (CORS-free)
            chrome.runtime.sendMessage({ action: 'fetchCurrencyRates', source: 'nbkz' });
            var waitCount = 0;
            var waitTimer = setInterval(function() {
                waitCount++;
                chrome.storage.local.get(['currencyRates', 'currencyRatesDate'], function(res) {
                    if (res.currencyRates && res.currencyRates.source === 'nbkz' || waitCount >= 20) {
                        clearInterval(waitTimer);
                        btn.textContent = t('refresh_rates');
                        btn.disabled = false;
                        if (res.currencyRates) {
                            currencyRates = res.currencyRates;
                            currencyRates.date = res.currencyRatesDate;
                            displayCurrencyRates();
                            updateQuickConvert();
                            showToast(t('rates_updated'));
                        }
                    }
                });
            }, 500);
        } else if (source === 'auto') {
            // Try to get rates from active tab (content.js extracts them)
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, function(resp) {
                        if (resp && resp.pong) {
                            // Extension is injected, rates should be extracted automatically
                            showToast('Rates extracted from current page');
                            setTimeout(function() {
                                chrome.storage.local.get(['currencyRates', 'currencyRatesDate'], function(res) {
                                    btn.textContent = t('refresh_rates');
                                    btn.disabled = false;
                                    if (res.currencyRates) {
                                        currencyRates = res.currencyRates;
                                        currencyRates.date = res.currencyRatesDate;
                                        displayCurrencyRates();
                                        updateQuickConvert();
                                    }
                                });
                            }, 1000);
                        } else {
                            // Open operator page
                            showToast('Open an operator page first');
                            btn.textContent = t('refresh_rates');
                            btn.disabled = false;
                        }
                    });
                }
            });
        } else {
            // B2B operator — open in new tab (auto-login will extract rates)
            var urls = {
                kompastour: 'https://online.kz.kompastour.com/search_tour',
                kazunion: 'https://online.kazunion.com/search_tour',
                joinup: 'https://online.joinup.kz/search_tour',
                anex: 'https://online3.anextour.kz/search_tour',
                selfie: 'https://b2b.selfietravel.kz/search_tour'
            };
            var url = urls[source];
            if (url) {
                chrome.tabs.create({ url: url, active: false });
                showToast('Opening ' + source + ' — rates will update after login');
                // Poll for rate updates
                var pollCount = 0;
                var pollTimer = setInterval(function() {
                    pollCount++;
                    chrome.storage.local.get(['currencyRates'], function(res) {
                        if (res.currencyRates && res.currencyRates.source && pollCount < 30) {
                            var srcName = res.currencyRates.source.toLowerCase();
                            if (srcName.includes(source) || srcName.includes(source.substring(0,4))) {
                                clearInterval(pollTimer);
                                btn.textContent = t('refresh_rates');
                                btn.disabled = false;
                                currencyRates = res.currencyRates;
                                displayCurrencyRates();
                                updateQuickConvert();
                                showToast(t('rates_updated'));
                            }
                        } else if (pollCount >= 30) {
                            clearInterval(pollTimer);
                            btn.textContent = t('refresh_rates');
                            btn.disabled = false;
                            showToast('Timeout — check if login worked');
                        }
                    });
                }, 2000);
            }
        }
    }

    /* ==================== EXPORT / IMPORT ==================== */

    function exportSettings() {
        chrome.runtime.sendMessage({ action: 'exportSettings' }, function(resp) {
            if (!resp || !resp.data) { showMsg(t('export_failed'), 'error'); return; }
            var blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'passport-autofill-settings-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    function importSettings() { document.getElementById('importFile').click(); }

    function exportCSV() {
        chrome.runtime.sendMessage({ action: 'exportCSV' }, function(resp) {
            if (!resp || !resp.csv) { showMsg(t('export_failed'), 'error'); return; }
            var blob = new Blob([resp.csv], { type: 'text/csv;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'passport-autofill-history-' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    function handleImportFile(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var settings = JSON.parse(ev.target.result);
                chrome.runtime.sendMessage({ action: 'importSettings', settings: settings }, function(res) {
                    if (res && res.success) {
                        showMsg(t('settings_imported'), 'success');
                        loadSettings();
                    } else {
                        showMsg(res ? res.error : t('import_failed'), 'error');
                    }
                });
            } catch (err) {
                showMsg(t('invalid_json'), 'error');
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

    function showToast(text) {
        var toast = document.getElementById('toast');
        if (!toast) { showMsg(text, 'success'); return; }
        toast.textContent = text;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2000);
    }

    /* ==================== LANG SWITCH ==================== */

    function initLangSwitch() {
        var ruBtn = document.getElementById('langRu');
        var enBtn = document.getElementById('langEn');
        if (!ruBtn || !enBtn) return;
        ruBtn.addEventListener('click', function() { setLang('ru'); });
        enBtn.addEventListener('click', function() { setLang('en'); });
    }

    /* ==================== QUICK COPY ICONS ==================== */

    function initQuickCopy() {
        var emailBtn = document.getElementById('quickCopyEmail');
        var phoneBtn = document.getElementById('quickCopyPhone');
        if (emailBtn) emailBtn.addEventListener('click', function() {
            chrome.storage.local.get(['defaultEmail'], function(res) {
                if (res.defaultEmail) {
                    navigator.clipboard.writeText(res.defaultEmail);
                    emailBtn.classList.add('copied');
                    setTimeout(function() { emailBtn.classList.remove('copied'); }, 1500);
                    showToast(t('email_copied'));
                } else {
                    showToast(t('no_email'));
                }
            });
        });
        if (phoneBtn) phoneBtn.addEventListener('click', function() {
            chrome.storage.local.get(['defaultPhone'], function(res) {
                if (res.defaultPhone) {
                    navigator.clipboard.writeText(res.defaultPhone);
                    phoneBtn.classList.add('copied');
                    setTimeout(function() { phoneBtn.classList.remove('copied'); }, 1500);
                    showToast(t('phone_copied'));
                } else {
                    showToast(t('no_phone'));
                }
            });
        });
    }

    /* ==================== ACCORDIONS ==================== */

    function initAccordions() {
        document.querySelectorAll('.accordion-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var acc = this.parentElement;
                acc.classList.toggle('open');
            });
        });
    }

    /* ==================== TOOLS PDF ==================== */

    function initToolsPdf() {
        var dropZone = document.getElementById('toolsPdfDrop');
        var fileInput = document.getElementById('toolsPdfInput');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', function() { fileInput.click(); });

        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            var file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf' || file.type.startsWith('image/')) parsePdfToTools(file);
        });

        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file && file.type === 'application/pdf' || file.type.startsWith('image/')) parsePdfToTools(file);
            e.target.value = '';
        });
    }

    async function parsePdfToTools(file) {
        var preview = document.getElementById('pdfPreview');
        if (!preview) return;
        preview.style.display = 'block';
        preview.className = 'tool-result show info';
        preview.innerHTML = '<div class="tool-result-title">Processing...</div>';

        try {
            var pdfjs = window.pdfjsLib || self.pdfjsLib || globalThis.pdfjsLib;
            if (!pdfjs) {
                preview.className = 'tool-result show error';
                preview.innerHTML = '<div class="tool-result-title">Error</div>PDF library not loaded';
                return;
            }
            if (pdfjs.GlobalWorkerOptions) {
                pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
            }

            var arrayBuffer = await file.arrayBuffer();
            var pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            var page = await pdf.getPage(1);
            var textContent = await page.getTextContent();
            var fullText = textContent.items.map(function(item) { return item.str; }).join('\n');
            var parsed = PassportParser.parse(fullText);

            var iinValid = parsed.iin ? PassportParser.validateIIN(parsed.iin) : false;
            var passportCheck = parsed.validDate ? PassportParser.validatePassportExpiry(parsed.validDate, '') : null;

            var html = '<div class="tool-result-title">' + escapeHtml(parsed.surname || '') + ' ' + escapeHtml(parsed.name || '') + '</div>';
            html += '<div class="tool-result-data">';
            html += '<dt>Passport</dt><dd>' + escapeHtml(parsed.number || '-') + '</dd>';
            html += '<dt>IIN</dt><dd>' + escapeHtml(parsed.iin || '-') + (parsed.iin ? (iinValid ? ' ✓' : ' ✗') : '') + '</dd>';
            html += '<dt>Birth</dt><dd>' + escapeHtml(parsed.birthDate || '-') + '</dd>';
            html += '<dt>Valid</dt><dd>' + escapeHtml(parsed.validDate || '-') + '</dd>';
            html += '<dt>Gender</dt><dd>' + (parsed.gender === '1' ? t('male') : parsed.gender === '0' ? t('female') : '-') + '</dd>';
            html += '</div>';

            preview.className = 'tool-result show ' + (parsed.isValid ? 'success' : 'warning');
            preview.innerHTML = html;
        } catch (err) {
            preview.className = 'tool-result show error';
            preview.innerHTML = '<div class="tool-result-title">Error</div>' + escapeHtml(err.message || '');
        }
    }

    /* ==================== OPERATOR CREDENTIALS (multi-account) ==================== */

    function loadCredentials() {
        chrome.storage.local.get(['operatorCreds', 'activeAccount'], function(res) {
            renderCredentials(res.operatorCreds || {}, res.activeAccount || {});
        });
    }

    function renderCredentials(creds, active) {
        var listEl = document.getElementById('credsList');
        if (!listEl) return;

        var names = { kompastour: 'Kompastour', kazunion: 'KazUnion', joinup: 'JoinUp', anex: 'AnexTour', selfie: 'SelfieTravel' };
        var needsSave = false;

        // Migrate old format
        Object.keys(creds).forEach(function(key) {
            if (!Array.isArray(creds[key])) {
                if (creds[key] && creds[key].login) {
                    creds[key] = [creds[key]];
                    needsSave = true;
                } else {
                    delete creds[key];
                    needsSave = true;
                }
            }
        });

        if (needsSave) {
            chrome.storage.local.set({ operatorCreds: creds });
        }

        var html = '';
        Object.keys(creds).forEach(function(key) {
            var accounts = creds[key];

            var activeIdx = active[key] || 0;

            html += '<div class="tool-panel" style="padding:10px;margin-bottom:6px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="font-weight:700;color:var(--s1);font-size:12px;">' + escapeHtml(names[key] || key) + '</span>';
            html += '<span style="font-size:9px;color:var(--text-muted);">' + accounts.length + ' account(s)</span>';
            html += '</div>';

            accounts.forEach(function(acc, idx) {
                var isActive = idx === activeIdx;
                html += '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;margin-bottom:3px;border-radius:4px;' +
                    (isActive ? 'background:color-mix(in srgb, var(--s1) 10%, transparent);' : '') + '">';
                html += '<div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--s1),var(--s2));' +
                    'color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' +
                    escapeHtml(acc.login.charAt(0).toUpperCase()) + '</div>';
                html += '<div style="flex:1;font-size:11px;color:var(--text);">' + escapeHtml(acc.login) + '</div>';
                if (acc.label) html += '<div style="font-size:9px;color:var(--text-muted);">' + escapeHtml(acc.label) + '</div>';
                if (isActive) html += '<span style="font-size:8px;color:var(--success);font-weight:700;">ACTIVE</span>';
                html += '<button class="domain-remove" data-op="' + escapeHtml(key) + '" data-idx="' + idx + '" style="font-size:12px;background:none;border:none;color:var(--danger);cursor:pointer;padding:0 4px;width:auto;">&times;</button>';
                html += '</div>';
            });

            html += '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.domain-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var op = this.getAttribute('data-op');
                var idx = parseInt(this.getAttribute('data-idx'));
                chrome.storage.local.get(['operatorCreds', 'activeAccount'], function(res) {
                    var c = res.operatorCreds || {};
                    var act = res.activeAccount || {};
                    // Migrate if needed
                    if (!Array.isArray(c[op])) {
                        if (c[op] && c[op].login) c[op] = [c[op]];
                        else { delete c[op]; chrome.storage.local.set({ operatorCreds: c, activeAccount: act }, function() { renderCredentials(c, act); }); return; }
                    }
                    c[op].splice(idx, 1);
                    if (c[op].length === 0) delete c[op];
                    if (act[op] >= (c[op] ? c[op].length : 0)) act[op] = 0;
                    chrome.storage.local.set({ operatorCreds: c, activeAccount: act }, function() {
                        renderCredentials(c, act);
                        showToast('Deleted');
                    });
                });
            });
        });
    }

    function saveCredential() {
        var op = document.getElementById('credOperator').value;
        var login = document.getElementById('credLogin').value.trim();
        var password = document.getElementById('credPassword').value.trim();
        var label = document.getElementById('credLabel') ? document.getElementById('credLabel').value.trim() : '';

        if (!login || !password) {
            showToast('Login and password required');
            return;
        }

        chrome.storage.local.get(['operatorCreds'], function(res) {
            var creds = res.operatorCreds || {};
            // Migrate old format
            if (creds[op] && !Array.isArray(creds[op])) {
                if (creds[op].login) {
                    creds[op] = [creds[op]];
                } else {
                    creds[op] = [];
                }
            }
            if (!creds[op]) creds[op] = [];

            for (var i = 0; i < creds[op].length; i++) {
                if (creds[op][i].login === login) {
                    creds[op][i].password = password;
                    if (label) creds[op][i].label = label;
                    chrome.storage.local.set({ operatorCreds: creds }, function() {
                        loadCredentials();
                        showToast('Updated');
                    });
                    return;
                }
            }
            creds[op].push({ login: login, password: password, label: label });
            chrome.storage.local.set({ operatorCreds: creds }, function() {
                loadCredentials();
                document.getElementById('credLogin').value = '';
                document.getElementById('credPassword').value = '';
                if (document.getElementById('credLabel')) document.getElementById('credLabel').value = '';
                showToast('Added');
            });
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
        if (!listEl) return;

        if (!history.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:12px;">' + escapeHtml(t('no_history')) + '</div>';
            return;
        }

        var html = '';
        history.forEach(function(h) {
            var date = new Date(h.timestamp);
            var dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString().substring(0, 5);
            var statusClass = h.success ? 'success' : (h.warnings && h.warnings.length ? 'warning' : 'error');
            var statusText = h.success ? 'OK' : (h.warnings && h.warnings.length ? '!' : 'ERR');

            html += '<div class="tool-panel" style="padding:10px;margin-bottom:6px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
            html += '<span style="font-weight:700;color:var(--s1);font-size:12px;">' + escapeHtml(h.site || '') + '</span>';
            html += '<span style="font-size:9px;color:var(--text-muted);font-family:JetBrains Mono,monospace;">' + escapeHtml(dateStr) + '</span>';
            html += '</div>';
            html += '<div style="font-size:11px;color:var(--text);font-weight:500;">' + escapeHtml(h.name || '') + '</div>';
            html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + escapeHtml(h.passport || '') + ' | IIN: ' + escapeHtml(h.iin || '') + '</div>';
            html += '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:color-mix(in srgb, var(--' + statusClass + ') 15%, transparent);color:var(--' + statusClass + ');">' + statusText + '</span>';
            if (h.warnings && h.warnings.length) {
                html += '<div style="font-size:9px;color:var(--warning);margin-top:4px;">' + escapeHtml(h.warnings.join('; ')) + '</div>';
            }
            html += '</div>';
        });

        listEl.innerHTML = html;
    }

    function clearHistory() {
        chrome.storage.local.set({ fillHistory: [] }, function() {
            renderHistory([]);
            showToast(t('history_cleared'));
        });
    }

    /* ==================== INIT ==================== */

    function init() {
        applySeasonalTheme();
        initTabs();
        initLangSwitch();
        initQuickCopy();
        initAccordions();
        initToolsPdf();
        loadSettings();
        loadDomains();
        loadCredentials();

        document.getElementById('saveBtn').addEventListener('click', saveSettings);
        document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdate);
        document.getElementById('addDomainBtn').addEventListener('click', addDomain);
        document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplate);
        document.getElementById('exportBtn').addEventListener('click', exportSettings);
        document.getElementById('importBtn').addEventListener('click', importSettings);
        document.getElementById('importFile').addEventListener('change', handleImportFile);
        document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
        document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
        document.getElementById('saveCredBtn').addEventListener('click', saveCredential);

        document.getElementById('validateIinBtn').addEventListener('click', validateIIN);
        document.getElementById('checkPassportBtn').addEventListener('click', checkPassport);
        document.getElementById('calcAgeBtn').addEventListener('click', calculateAge);
        document.getElementById('translitBtn').addEventListener('click', transliterate);

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

        initPdfDrop();

        loadCurrencyRates();

        // Listen for rate updates from content.js
        chrome.storage.onChanged.addListener(function(changes, area) {
            if (area === 'local' && changes.currencyRates) {
                currencyRates = changes.currencyRates.newValue || currencyRates;
                displayCurrencyRates();
                updateQuickConvert();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();