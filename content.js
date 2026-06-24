if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    var chrome = browser;
}

(function() {
    'use strict';

    // Prevent double injection
    if (window.__passportAutoFillInjected) {
        return;
    }
    window.__passportAutoFillInjected = true;

    console.log('[PassportAutoFill] Content script loaded on:', window.location.href);

    // Setup PDF.js worker — call before every PDF operation
    function ensurePdfWorker() {
        try {
            if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
            }
        } catch(e) {
            console.error('[PassportAutoFill] pdfjsLib init error:', e);
        }
    }
    ensurePdfWorker();

    let lastKnownPrice = 0;
    let previewModal = null;
    let formDetected = false;
    let autoLoginTried = false;
    let lastUsedCred = null;

    function getOperatorKey() {
        const host = window.location.hostname;
        if (host.includes('kompastour')) return 'kompastour';
        if (host.includes('kazunion')) return 'kazunion';
        if (host.includes('joinup')) return 'joinup';
        if (host.includes('anextour')) return 'anex';
        if (host.includes('selfietravel')) return 'selfie';
        if (host.includes('fstravel') || host.includes('funandsun')) return 'fstravel';
        return null;
    }

    function closeSamoPopup() {
        var popup = document.getElementById('samo_popup');
        if (popup) popup.remove();
        if (typeof window.jQuery !== 'undefined') {
            try { window.jQuery('#samo_popup').remove(); } catch(e) {}
        }
    }

    let captchaAttempts = 0;

    async function trySolveCaptcha() {
        const captchaImg = Utils.$('#icaptcha, .captcha-self, img[src*="data:image/jpeg"]');
        if (!captchaImg) return;

        captchaAttempts++;
        if (captchaAttempts > 3) return;

        try {
            const loaded = await loadOCREngine();
            if (!loaded) return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = 'anonymous';

            await new Promise(function(resolve, reject) {
                img.onload = resolve;
                img.onerror = reject;
                img.src = captchaImg.src;
            });

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            const worker = await Tesseract.createWorker('eng');
            await worker.setParameters({
                tessedit_char_whitelist: '0123456789',
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
            });
            const { data: { text } } = await worker.recognize(canvas);
            await worker.terminate();

            const digits = text.replace(/\D/g, '').trim();
            if (digits.length > 0) {
                const captchaInput = Utils.$('#fcaptcha, input[name="antibot"], .captcha-input');
                if (captchaInput) {
                    captchaInput.value = digits;
                    captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
                    captchaInput.dispatchEvent(new Event('change', { bubbles: true }));

                    const captchaForm = Utils.$('#captchaForm');
                    if (captchaForm) {
                        setTimeout(function() {
                            captchaForm.submit();
                        }, 300);
                    }
                }
            }
        } catch (err) {
            console.error('[PassportAutoFill] Captcha solve error:', err);
        }
    }

    function tryAutoLogin() {
        if (autoLoginTried) {
            checkSessionTimeoutLogin();
            return;
        }
        const opKey = getOperatorKey();
        if (!opKey) return;

        chrome.storage.local.get(['operatorCreds', 'activeAccount'], function(res) {
            const allCreds = res.operatorCreds || {};
            let opCreds = allCreds[opKey];

            if (!opCreds) return;

            // Migrate old format { login, password } -> [{ login, password }]
            if (!Array.isArray(opCreds)) {
                if (opCreds.login && opCreds.password) {
                    opCreds = [opCreds];
                    allCreds[opKey] = opCreds;
                    chrome.storage.local.set({ operatorCreds: allCreds });
                } else {
                    return;
                }
            }

            if (opCreds.length === 0) return;

            // Check for session timeout modal (#logonContainer)
            const logonModal = document.getElementById('logonContainer');
            const modalLoginInput = logonModal ? logonModal.querySelector('#login, input[name="login"]') : null;
            const modalPassInput = logonModal ? logonModal.querySelector('#password, input[type="password"]') : null;

            if (modalLoginInput && modalPassInput && modalLoginInput.offsetParent !== null) {
                // Session timeout — re-login with last used account
                const activeIdx = res.activeAccount && res.activeAccount[opKey] != null
                    ? res.activeAccount[opKey] : 0;
                const cred = opCreds[activeIdx] || opCreds[0];
                if (cred) {
                    lastUsedCred = cred;
                    doModalLogin(cred, logonModal);
                }
                return;
            }

            // Normal login page
            const loginInput = Utils.$('#login, input[name="login"]');
            const passInput = Utils.$('#password, input[type="password"]');
            if (!loginInput || !passInput) return;
            if (loginInput.offsetParent === null) return;

            // Check if already logged in (login field hidden)
            if (loginInput.value.length > 0 && passInput.value.length > 0) return;

            autoLoginTried = true;

            // If captcha present, try to solve it
            const captchaForm = Utils.$('#captchaForm, .captcha-wrapper');
            if (captchaForm && captchaForm.offsetParent !== null) {
                trySolveCaptcha();
                return;
            }

            if (opCreds.length === 1) {
                lastUsedCred = opCreds[0];
                doLogin(opCreds[0]);
                return;
            }

            // 2+ accounts: always show selector
            showAccountSelector(opKey, opCreds);
        });
    }

    function checkSessionTimeoutLogin() {
        const logonModal = document.getElementById('logonContainer');
        if (!logonModal) return;
        if (logonModal.offsetParent === null) return;

        const loginInput = logonModal.querySelector('#login, input[name="login"]');
        const passInput = logonModal.querySelector('#password, input[type="password"]');
        if (!loginInput || !passInput) return;
        if (loginInput.value.length > 0) return;

        if (lastUsedCred) {
            doModalLogin(lastUsedCred, logonModal);
            return;
        }

        const opKey = getOperatorKey();
        if (!opKey) return;

        chrome.storage.local.get(['operatorCreds', 'activeAccount'], function(res) {
            const allCreds = res.operatorCreds || {};
            let opCreds = allCreds[opKey];
            if (!opCreds || opCreds.length === 0) return;

            const activeIdx = res.activeAccount && res.activeAccount[opKey] != null
                ? res.activeAccount[opKey] : 0;
            const cred = opCreds[activeIdx] || opCreds[0];
            if (cred) {
                lastUsedCred = cred;
                doModalLogin(cred, logonModal);
            }
        });
    }

    function doModalLogin(cred, modal) {
        const loginInput = modal.querySelector('#login, input[name="login"]');
        const passInput = modal.querySelector('#password, input[type="password"]');
        if (!loginInput || !passInput) return;

        loginInput.value = cred.login;
        passInput.value = cred.password;
        loginInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Submit the modal form
        const form = modal.querySelector('form');
        if (form) {
            setTimeout(function() { form.submit(); }, 300);
        } else {
            const btn = modal.querySelector('button[type="submit"], .button, button:not([class*="close"])');
            if (btn) btn.click();
        }
    }

    function doLogin(cred) {
        const loginInput = Utils.$('#login, input[name="login"]');
        const passInput = Utils.$('#password, input[type="password"]');
        if (!loginInput || !passInput) return;

        loginInput.value = cred.login;
        passInput.value = cred.password;
        loginInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

        const form = loginInput.closest('form');
        if (form) {
            setTimeout(function() {
                form.submit();
            }, 300);
        } else {
            const submitBtn = Utils.$('button[type="submit"], input[type="submit"], #auth-submit-button, .button[type="submit"]');
            if (submitBtn) submitBtn.click();
            else {
                passInput.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'Enter' }));
                passInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
            }
        }
    }

    function showAccountSelector(opKey, accounts) {
        const opNames = {
            kompastour: 'Kompastour', kazunion: 'KazUnion', joinup: 'JoinUp',
            anex: 'AnexTour', selfie: 'SelfieTravel', fstravel: 'Fstravel'
        };

        const overlay = document.createElement('div');
        overlay.id = 'fs-account-selector';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(26,15,10,0.7);backdrop-filter:blur(8px);' +
            'display:flex;align-items:center;justify-content:center;z-index:99999;' +
            'font-family:Inter,-apple-system,sans-serif;animation:fadeIn 0.2s ease;';

        let cardsHtml = '';
        accounts.forEach(function(acc, idx) {
            const initial = acc.login.charAt(0).toUpperCase();
            cardsHtml += '<div class="fs-acc-card" data-idx="' + idx + '" style="' +
                'background:#fffaf2;border:1.5px solid #d4c4a8;border-radius:12px;padding:20px 28px;' +
                'cursor:pointer;transition:all 0.25s ease;text-align:center;min-width:180px;">' +
                '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#c66b3d,#b8854f);' +
                'color:white;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;margin:0 auto 10px;">' +
                initial + '</div>' +
                '<div style="font-size:14px;font-weight:700;color:#1a0f0a;font-family:DM Serif Display,serif;">' +
                Utils.escapeHtml(acc.login) + '</div>' +
                (acc.label ? '<div style="font-size:10px;color:#8a7560;margin-top:3px;font-family:JetBrains Mono,monospace;">' +
                Utils.escapeHtml(acc.label) + '</div>' : '') +
                '</div>';
        });

        overlay.innerHTML = '<div style="background:#fffaf2;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);' +
            'padding:28px;max-width:520px;width:90%;">' +
            '<div style="font-size:18px;font-weight:400;color:#1a0f0a;font-family:DM Serif Display,serif;' +
            'margin-bottom:4px;text-align:center;">' + (opNames[opKey] || opKey) + '</div>' +
            '<div style="font-size:11px;color:#8a7560;text-align:center;margin-bottom:20px;font-family:JetBrains Mono,monospace;' +
            'text-transform:uppercase;letter-spacing:1px;">Select account</div>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">' + cardsHtml + '</div>' +
            '<div style="text-align:center;margin-top:16px;">' +
            '<button id="fs-acc-skip" style="background:none;border:1px solid #d4c4a8;border-radius:6px;' +
            'padding:6px 18px;font-size:11px;color:#8a7560;cursor:pointer;font-family:JetBrains Mono,monospace;' +
            'text-transform:uppercase;letter-spacing:0.5px;">Skip</button>' +
            '</div></div>';

        document.body.appendChild(overlay);

        overlay.querySelectorAll('.fs-acc-card').forEach(function(card) {
            card.addEventListener('mouseenter', function() {
                card.style.borderColor = '#c66b3d';
                card.style.transform = 'translateY(-3px)';
                card.style.boxShadow = '0 8px 24px rgba(198,107,61,0.15)';
            });
            card.addEventListener('mouseleave', function() {
                card.style.borderColor = '#d4c4a8';
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });
            card.addEventListener('click', function() {
                const idx = parseInt(this.getAttribute('data-idx'));
                chrome.storage.local.get(['activeAccount'], function(res) {
                    var active = res.activeAccount || {};
                    active[opKey] = idx;
                    chrome.storage.local.set({ activeAccount: active }, function() {
                        overlay.remove();
                        doLogin(accounts[idx]);
                    });
                });
            });
        });

        const skipBtn = Utils.$('#fs-acc-skip', overlay);
        if (skipBtn) skipBtn.addEventListener('click', function() { overlay.remove(); });
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });
    }

    function getSiteSettings() {
        const host = window.location.hostname;

        const defaultSettings = {
            nationalityId: null,  // null = auto-detect from select
            forceKAZSeries: false,
            identityDocId: null   // null = auto-detect (use first option)
        };

        const siteConfigs = {
            'kompastour': { nationalityId: null, forceKAZSeries: true },
            'kazunion': { nationalityId: null, forceKAZSeries: false },
            'joinup': { nationalityId: null, forceKAZSeries: false },
            'anextour': { nationalityId: null, forceKAZSeries: false },
            'selfietravel': { nationalityId: null, forceKAZSeries: false }
        };

        for (const [site, config] of Object.entries(siteConfigs)) {
            if (host.includes(site)) {
                return { ...defaultSettings, ...config };
            }
        }

        return defaultSettings;
    }

    function autoDetectNationality(index) {
        const select = Utils.$(`select[name*="[${index}][NATIONALITY]"]`);
        if (!select) return null;
        // Look for Kazakhstan option
        for (let i = 0; i < select.options.length; i++) {
            const text = (select.options[i].text || '').toLowerCase();
            const val = select.options[i].value;
            if (text.includes('казах') || text.includes('kazakh') || text.includes('kaz') || val === '7' || val === '367404') {
                return val;
            }
        }
        // Fallback: return first non-empty option
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value && select.options[i].value !== '' && select.options[i].value !== '-2147483647') {
                return select.options[i].value;
            }
        }
        return null;
    }

    async function waitForSelectOptions(index, namePart, maxWait) {
        maxWait = maxWait || 5000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const select = Utils.$(`select[name*="[${index}][${namePart}]"]`);
            if (select && select.options.length > 1) return select;
            await Utils.sleep(200);
        }
        return Utils.$(`select[name*="[${index}][${namePart}]"]`);
    }

    async function fillSelectWithRetry(index, namePart, value, maxWait) {
        if (!value) return false;
        const select = await waitForSelectOptions(index, namePart, maxWait);
        if (!select) return false;
        // Find matching option
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
            if (String(select.options[i].value) === String(value)) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) {
            // Try partial match
            for (let i = 0; i < select.options.length; i++) {
                var optVal = String(select.options[i].value);
                var optText = (select.options[i].text || '').toLowerCase();
                if (optVal.indexOf(String(value)) === 0 || String(value).indexOf(optVal) === 0 ||
                    optText.includes(String(value).toLowerCase())) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }
        }
        if (!found) return false;

        select.value = select.options[select.selectedIndex].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));

        // Update chosen container
        var chosenContainer = select.nextElementSibling;
        if (chosenContainer && chosenContainer.classList.contains('chosen-container')) {
            var chosenSpan = Utils.$('.chosen-single span', chosenContainer);
            var opt = select.options[select.selectedIndex];
            if (opt && chosenSpan) chosenSpan.textContent = opt.text;
            if (typeof window.jQuery !== 'undefined') {
                try {
                    window.jQuery(select).val(select.value);
                    window.jQuery(select).trigger('chosen:updated');
                    window.jQuery(select).trigger('change');
                } catch(e) {}
            }
        }
        if (typeof window.jQuery !== 'undefined' && !chosenContainer) {
            try { window.jQuery(select).val(select.value); window.jQuery(select).trigger('change'); } catch(e) {}
        }
        return true;
    }

    function autoDetectIdentityDoc(index) {
        const select = Utils.$(`select[name*="[${index}][IDENTITY_DOCUMENT]"]`);
        if (!select) return null;
        if (select.options.length <= 1) return null;
        // Priority 1: exact "Паспорт" (not "Дипломатический паспорт" etc.)
        for (let i = 0; i < select.options.length; i++) {
            const text = (select.options[i].text || '').toLowerCase().trim();
            if (text === 'паспорт' || text === 'passport') {
                return select.options[i].value;
            }
        }
        // Priority 2: "Заграничный паспорт" / "Загранпаспорт"
        for (let i = 0; i < select.options.length; i++) {
            const text = (select.options[i].text || '').toLowerCase().trim();
            if (text.includes('загран') && text.includes('паспорт')) {
                return select.options[i].value;
            }
        }
        // Priority 3: "Удостоверение" / "ID карта"
        for (let i = 0; i < select.options.length; i++) {
            const text = (select.options[i].text || '').toLowerCase().trim();
            if (text.includes('удостовер') || text.includes('identity') || text.includes('id карта') || text.includes('id card') || text.includes('national id')) {
                return select.options[i].value;
            }
        }
        // Fallback: first non-empty option
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value && select.options[i].value !== '' && select.options[i].value !== '-2147483647') return select.options[i].value;
        }
        return null;
    }

    function detectSiteId() {
        const host = window.location.hostname;
        if (host.includes('fstravel') || host.includes('funandsun')) return 'Fstravel';
        if (host.includes('kompastour')) return 'Kompastour';
        if (host.includes('kazunion')) return 'KazUnion';
        if (host.includes('joinup')) return 'JoinUp';
        if (host.includes('anextour')) return 'AnexTour';
        if (host.includes('selfietravel')) return 'SelfieTravel';
        if (host.includes('pegast')) return 'Pegast';
        if (host.includes('sanat')) return 'Sanat';
        if (host.includes('abktourism')) return 'ABK';

        chrome.storage.local.get(['customDomains'], function(res) {
            const custom = res.customDomains || [];
            for (const domain of custom) {
                const re = new RegExp('^' + domain.pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
                if (re.test(window.location.href)) return domain.siteId;
            }
        });

        return window.location.hostname;
    }

    function reportFormDetection() {
        const hasTourists = !!Utils.$('div.tourist');
        const hasPrice = !!Utils.$('.CLAIMPRICE');
        const hasForm = hasTourists || hasPrice;

        if (hasForm !== formDetected) {
            formDetected = hasForm;
            chrome.runtime.sendMessage({ action: 'formDetected', hasForm: hasForm });
        }
    }

    function findLegendContainer(touristDiv) {
        const parentFieldset = touristDiv.parentElement;
        if (parentFieldset) {
            const legend = Utils.$('.legend-tag', parentFieldset);
            if (legend) return legend;
        }

        const closestFieldset = touristDiv.closest('fieldset.panel');
        if (closestFieldset) {
            const legend = Utils.$('.legend-tag', closestFieldset);
            if (legend) return legend;
        }

        const anyFieldset = touristDiv.closest('fieldset');
        if (anyFieldset) {
            const legend = Utils.$('.legend-tag', anyFieldset);
            if (legend) return legend;
        }

        return null;
    }

    function initDropZones() {
        ['dragover', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        const touristDivs = Utils.$$('div.tourist');
        console.log('[PassportAutoFill] initDropZones: found', touristDivs.length, 'tourist divs');

        if (touristDivs.length === 0) return;

        let created = 0;
        touristDivs.forEach((touristDiv) => {
            const touristIndex = touristDiv.dataset.peopleinc;
            if (!touristIndex) {
                console.log('[PassportAutoFill] Tourist has no data-peopleinc:', touristDiv.id);
                return;
            }

            // Check if dropzone already exists anywhere near this tourist
            const parentEl = touristDiv.parentElement;
            const closestFieldset = touristDiv.closest('fieldset');
            const allContainers = [parentEl, closestFieldset].filter(Boolean);

            for (const c of allContainers) {
                if (Utils.$('.fs-passport-dropzone', c)) {
                    console.log('[PassportAutoFill] Dropzone already exists for tourist', touristIndex);
                    return;
                }
            }

            const legend = findLegendContainer(touristDiv);
            console.log('[PassportAutoFill] Tourist', touristIndex, '| legend:', legend ? legend.innerText.trim().substring(0, 30) : 'NONE', '| parent:', parentEl ? parentEl.tagName + '.' + parentEl.className.substring(0, 30) : '?');

            if (legend) {
                createZoneForTourist(legend, touristIndex);
                created++;
            } else {
                // Try multiple fallback containers
                const container = parentEl || closestFieldset;
                if (container) {
                    createZoneForTouristContainer(container, touristIndex);
                    created++;
                } else {
                    // Last resort: insert before tourist div
                    console.log('[PassportAutoFill] No container found for tourist', touristIndex, '— using direct insert');
                    createZoneForTouristDirect(touristDiv, touristIndex);
                    created++;
                }
            }
        });

        console.log('[PassportAutoFill] Created', created, 'dropzones');

        reportFormDetection();
    }

    function createZoneForTouristDirect(touristDiv, index) {
        const div = document.createElement('div');
        div.className = 'fs-passport-dropzone';
        div.innerHTML = '<span>Passport PDF / Photo</span><span class="fs-status-text">Drag &amp; drop or click</span>';

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.add('dragover');
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('dragover');
        });

        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
            if (files.length === 0) {
                updateZoneStatus(div, 'Need PDF file!', 'red');
            } else if (files.length === 1) {
                await handlePdf(files[0], index, div);
            } else {
                await handleMultiplePdfs(files, div);
            }
        });

        div.addEventListener('click', () => openFileDialog(index, div));

        touristDiv.parentElement.insertBefore(div, touristDiv);
    }

    function createZoneForTouristContainer(container, index) {
        const div = document.createElement('div');
        div.className = 'fs-passport-dropzone';
        div.innerHTML = '<span>Passport PDF / Photo</span><span class="fs-status-text">Drag & drop or click</span>';
        div.style.marginBottom = '10px';

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.add('dragover');
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('dragover');
        });

        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
            if (files.length === 0) {
                updateZoneStatus(div, 'Need PDF file!', 'red');
            } else if (files.length === 1) {
                await handlePdf(files[0], index, div);
            } else {
                await handleMultiplePdfs(files, div);
            }
        });

        div.addEventListener('click', () => openFileDialog(index, div));

        container.insertBefore(div, container.firstChild);
    }

    function createZoneForTourist(container, index) {
        const div = document.createElement('div');
        div.className = 'fs-passport-dropzone';
        div.innerHTML = '<span>Passport PDF / Photo</span><span class="fs-status-text">Drag & drop or click</span>';

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.add('dragover');
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('dragover');
        });

        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
            if (files.length === 0) {
                updateZoneStatus(div, 'Need PDF file!', 'red');
            } else if (files.length === 1) {
                await handlePdf(files[0], index, div);
            } else {
                await handleMultiplePdfs(files, div);
            }
        });

        div.addEventListener('click', () => openFileDialog(index, div));

        container.appendChild(div);
    }

    function openFileDialog(index, zoneElement) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,image/*';
        input.multiple = true;
        input.addEventListener('change', async () => {
            const files = Array.from(input.files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
            if (files.length === 1) {
                await handlePdf(files[0], index, zoneElement);
            } else if (files.length > 1) {
                await handleMultiplePdfs(files, zoneElement);
            }
        });
        input.click();
    }

    async function handleMultiplePdfs(files, triggerZone) {
        const touristDivs = Utils.$$('div.tourist');
        const available = Array.from(touristDivs).filter(d => d.dataset.peopleinc);

        if (available.length === 0) {
            updateZoneStatus(triggerZone, 'No tourists on page', 'red');
            return;
        }

        const parsedResults = [];
        for (let i = 0; i < files.length; i++) {
            updateZoneStatus(triggerZone, 'Processing ' + (i + 1) + '/' + files.length + '...', 'blue');
            try {
                let fullText = '';
                if (files[i].type.startsWith('image/')) {
                    const ocrText = await ocrFromImage(files[i]);
                    fullText = ocrText || '';
                } else {
                    const arrayBuffer = await readFileAsArrayBuffer(files[i]);
                    const copy = new Uint8Array(arrayBuffer);
                    ensurePdfWorker(); const pdf = await pdfjsLib.getDocument({ data: copy, disableRange: true, disableStream: true, isEvalSupported: false }).promise;
                    const page = await pdf.getPage(1);
                    const textContent = await page.getTextContent();
                    fullText = textContent.items.map(item => item.str).join('\n');
                    await pdf.cleanup();
                    await pdf.destroy();
                }
                const parsed = PassportParser.parse(fullText);
                parsedResults.push({ parsed, file: files[i] });
            } catch (err) {
                console.error('[PassportAutoFill] PDF parse error #' + (i+1) + ':', err);
                parsedResults.push({ parsed: { surname: 'ERROR', name: '', number: '', isValid: false }, file: files[i] });
            }
        }

        if (parsedResults.length === 1) {
            await handlePdf(files[0], available[0].dataset.peopleinc, triggerZone);
            return;
        }

        showGroupFillModal(parsedResults, available, triggerZone);
    }

    function showGroupFillModal(results, available, triggerZone) {
        if (previewModal) previewModal.remove();

        const modal = document.createElement('div');
        modal.id = 'fs-preview-modal';

        let rowsHtml = '';
        for (let i = 0; i < Math.max(results.length, available.length); i++) {
            const r = results[i];
            const tourist = available[i];
            const touristNum = tourist ? tourist.dataset.peopleinc : '-';
            const name = r ? (r.parsed.surname + ' ' + r.parsed.name).trim() : '-';
            const passport = r ? (r.parsed.number || '-') : '-';
            const iin = r ? (r.parsed.iin || '-') : '-';
            const validDate = r ? (r.parsed.validDate || '-') : '-';
            const status = r ? (r.parsed.isValid ? 'OK' : 'CHECK') : '-';

            rowsHtml += `
                <div class="fs-group-row" style="display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #e0e5ec;">
                    <div style="width:30px;font-weight:700;color:#366383;">${i + 1}</div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:13px;">${Utils.escapeHtml(name)}</div>
                        <div style="font-size:10px;color:#888;">${Utils.escapeHtml(passport)} | IIN: ${Utils.escapeHtml(iin)} | Valid: ${Utils.escapeHtml(validDate)}</div>
                    </div>
                    <div style="font-size:10px;font-weight:600;color:${status === 'OK' ? '#4caf50' : '#ff9800'};">${status}</div>
                    <div style="font-size:10px;color:#366383;font-weight:600;">→ Tourist ${Utils.escapeHtml(touristNum)}</div>
                </div>
            `;
        }

        const skipCount = results.length > available.length ? (results.length - available.length) : 0;

        modal.innerHTML = `
            <div class="fs-modal-content">
                <div class="fs-modal-header">
                    <h3>Group Fill — ${results.length} PDFs → ${available.length} tourists</h3>
                    <button class="fs-modal-close">&times;</button>
                </div>
                <div class="fs-modal-body">
                    ${skipCount > 0 ? '<div class="fs-ocr-warning" style="margin-bottom:12px;"><div class="fs-ocr-warning-icon">!</div><div><strong>Warning</strong><br>' + skipCount + ' PDFs will be skipped (not enough tourists)</div></div>' : ''}
                    ${rowsHtml}
                </div>
                <div class="fs-modal-footer">
                    <button class="fs-btn fs-btn-cancel">Cancel</button>
                    <button class="fs-btn fs-btn-fill">Fill All</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        previewModal = modal;

        Utils.$('.fs-modal-close', modal).addEventListener('click', () => closeModal());
        Utils.$('.fs-btn-cancel', modal).addEventListener('click', () => closeModal());

        Utils.$('.fs-btn-fill', modal).addEventListener('click', async () => {
            closeModal();
            for (let i = 0; i < results.length && i < available.length; i++) {
                const index = available[i].dataset.peopleinc;
                const zone = Utils.$('.fs-passport-dropzone', available[i].parentElement) ||
                             Utils.$('.fs-passport-dropzone', available[i].closest('fieldset')) ||
                             triggerZone;
                await fillFormSequentially(results[i].parsed, index, zone);
                await Utils.sleep(500);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    function initPriceWidget() {
        if (Utils.$('#fs-price-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'fs-price-widget';
        widget.innerHTML = `
            <h4>Price Monitor</h4>
            <div class="current-price">...</div>
            <div class="preliminary-price" style="display:none;"></div>
            <div class="secondary-price"></div>
            <div class="price-diff" style="display:none;"></div>
        `;
        document.body.appendChild(widget);

        const priceCell = Utils.$('.CLAIMPRICE');

        if (priceCell) {
            updateWidgetPrice(priceCell.innerText);
        }
    }

    function updateWidgetPrice(rawText) {
        const widget = Utils.$('#fs-price-widget');
        if (!widget || !rawText) return;

        const cleanText = rawText.trim();
        const mainPriceMatch = cleanText.match(/([\d\s]+)(\w{3})/);

        if (mainPriceMatch) {
            const currentVal = parseFloat(mainPriceMatch[1].replace(/\s/g, ''));
            const currency = mainPriceMatch[2];
            const lines = cleanText.split(/\n/);

            Utils.$('.current-price', widget).innerText = lines[0];
            if (lines[1]) Utils.$('.secondary-price', widget).innerText = lines[1];

            const prelimEl = Utils.$('.preliminary-price', widget);
            chrome.storage.local.get(['currencyRates'], function(res) {
                const rates = res.currencyRates || {};
                let kztRate = rates[currency] || 0;
                if (kztRate > 0) {
                    const prelimKzt = Math.round(currentVal * kztRate);
                    prelimEl.style.display = 'block';
                    prelimEl.innerText = '≈ ' + prelimKzt.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' KZT';
                }
            });

            const diffEl = Utils.$('.price-diff', widget);
            if (lastKnownPrice !== 0 && lastKnownPrice !== currentVal) {
                const diff = currentVal - lastKnownPrice;
                diffEl.style.display = 'block';
                diffEl.className = 'price-diff';
                widget.style.animation = 'none';
                widget.offsetHeight;

                if (diff > 0) {
                    diffEl.innerText = 'Price increased by ' + diff + ' ' + currency;
                    diffEl.classList.add('price-up');
                    widget.style.animation = 'flashRed 1s';
                } else {
                    diffEl.innerText = 'Price decreased by ' + Math.abs(diff) + ' ' + currency;
                    diffEl.classList.add('price-down');
                    widget.style.animation = 'flashGreen 1s';
                }
            }
            lastKnownPrice = currentVal;
        }
    }

    /* ==================== OCR ==================== */

    async function loadOCREngine() {
        if (typeof Tesseract !== 'undefined' && Tesseract.createWorker) return true;
        if (typeof self !== 'undefined' && self.Tesseract && self.Tesseract.createWorker) return true;
        if (typeof window !== 'undefined' && window.Tesseract && window.Tesseract.createWorker) return true;
        return false;
    }

    async function ocrRecognize(imageOrCanvas) {
        const loaded = await loadOCREngine();
        if (!loaded) throw new Error('OCR engine not available');

        const worker = await Tesseract.createWorker('eng');
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
        });
        const { data: { text } } = await worker.recognize(imageOrCanvas);
        await worker.terminate();
        return text;
    }

    async function ocrFromPdf(pdf) {
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const text = await ocrRecognize(canvas);
        return text;
    }

    function readFileAsDataURL(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(reader.error); };
            reader.readAsDataURL(file);
        });
    }

    async function ocrFromImage(file) {
        const dataUrl = await readFileAsDataURL(file);
        const img = new Image();
        img.src = dataUrl;
        await new Promise(function(resolve, reject) {
            img.onload = resolve;
            img.onerror = reject;
        });
        const text = await ocrRecognize(img);
        return text;
    }

    /* ==================== FILE HANDLING (PDF + Image) ==================== */

    function readFileAsArrayBuffer(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(reader.error); };
            reader.readAsArrayBuffer(file);
        });
    }

    async function handlePdf(file, touristIndex, zoneElement) {
        updateZoneStatus(zoneElement, 'Processing...', 'blue');

        try {
            // Image file — OCR directly
            if (file.type.startsWith('image/')) {
                updateZoneStatus(zoneElement, 'Scanning photo...', 'orange');
                const ocrText = await ocrFromImage(file);
                if (ocrText && ocrText.trim().length > 20) {
                    const parsedData = PassportParser.parse(ocrText);
                    parsedData.ocrUsed = true;
                    chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill'], (defaults) => {
                        parsedData.email = defaults.defaultEmail || '';
                        parsedData.phone = defaults.defaultPhone || '';
                        if (defaults.autoFill && parsedData.isValid) {
                            fillFormSequentially(parsedData, touristIndex, zoneElement);
                        } else {
                            showPreviewModal(parsedData, touristIndex, zoneElement);
                        }
                    });
                } else {
                    updateZoneStatus(zoneElement, 'Photo OCR failed', 'red');
                }
                return;
            }

            // PDF file
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const copy = new Uint8Array(arrayBuffer);
            ensurePdfWorker(); const pdf = await pdfjsLib.getDocument({ data: copy, disableRange: true, disableStream: true, isEvalSupported: false }).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            const fullText = textContent.items.map(item => item.str).join('\n');

            let parsedData;
            let ocrUsed = false;

            if (fullText.trim().length < 20) {
                updateZoneStatus(zoneElement, 'No text layer, trying OCR...', 'orange');
                const ocrText = await ocrFromPdf(pdf);
                if (ocrText && ocrText.trim().length > 20) {
                    parsedData = PassportParser.parse(ocrText);
                    ocrUsed = true;
                } else {
                    updateZoneStatus(zoneElement, 'OCR failed - no readable text', 'red');
                    return;
                }
            } else {
                parsedData = PassportParser.parse(fullText);
            }

            chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill'], (defaults) => {
                parsedData.email = defaults.defaultEmail || '';
                parsedData.phone = defaults.defaultPhone || '';
                parsedData.ocrUsed = ocrUsed;

                // Cleanup pdf.js resources
                pdf.cleanup().then(() => pdf.destroy()).catch(() => {});

                if (defaults.autoFill && parsedData.isValid && !ocrUsed) {
                    fillFormSequentially(parsedData, touristIndex, zoneElement);
                } else {
                    showPreviewModal(parsedData, touristIndex, zoneElement);
                }
            });

        } catch (err) {
            console.error('[PassportAutoFill] File error:', err);
            var errMsg = file.type.startsWith('image/') ? 'Photo error' : 'PDF Error';
            updateZoneStatus(zoneElement, errMsg, 'red');
        }
    }

    function showPreviewModal(data, touristIndex, zoneElement) {
        if (previewModal) previewModal.remove();

        const modal = document.createElement('div');
        modal.id = 'fs-preview-modal';

        const validation = validatePassportData(data);

        const ocrWarningHtml = data.ocrUsed ? `
            <div class="fs-ocr-warning">
                <div class="fs-ocr-warning-icon">!</div>
                <div>
                    <strong>OCR Warning</strong><br>
                    Data extracted via OCR may contain errors. Please verify ALL fields carefully before filling.
                </div>
            </div>
        ` : '';

        modal.innerHTML = `
            <div class="fs-modal-content">
                <div class="fs-modal-header">
                    <h3>Extracted Data</h3>
                    <button class="fs-modal-close">&times;</button>
                </div>
                <div class="fs-modal-body">
                    ${ocrWarningHtml}
                    <div class="fs-validation-summary ${validation.isValid ? 'success' : 'error'}">
                        <span class="fs-validation-icon">${validation.isValid ? '✓' : '!'}</span>
                        <span>${validation.isValid ? 'Data looks good' : 'Please check highlighted fields'}</span>
                        ${validation.warnings.length > 0 ? '<span class="fs-warnings-count">' + validation.warnings.length + ' warning(s)</span>' : ''}
                    </div>

                    <div class="fs-data-grid">
                        <div class="fs-field-row">
                            <label>Surname</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-surname" value="${Utils.escapeHtml(data.surname)}" class="${getFieldClass('surname', data)}">
                                <span class="fs-field-error" id="error-surname">${getFieldError('surname', data)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Name</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-name" value="${Utils.escapeHtml(data.name)}" class="${getFieldClass('name', data)}">
                                <span class="fs-field-error" id="error-name">${getFieldError('name', data)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Passport</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-number" value="${Utils.escapeHtml(data.number)}" class="${getFieldClass('number', data)}">
                                <span class="fs-field-error" id="error-number">${getFieldError('number', data)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>IIN</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-iin" value="${Utils.escapeHtml(data.iin)}" maxlength="12" class="${getIINClass(data.iin)}">
                                <span class="fs-field-error" id="error-iin">${getIINError(data.iin)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Birth Date</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-birth" value="${Utils.escapeHtml(data.birthDate)}" placeholder="DD.MM.YYYY" class="${getFieldClass('birthDate', data)}">
                                <span class="fs-field-error" id="error-birth">${getFieldError('birthDate', data)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Valid Until</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-valid" value="${Utils.escapeHtml(data.validDate)}" placeholder="DD.MM.YYYY" class="${getValidDateClass(data.validDate)}">
                                <span class="fs-field-error" id="error-valid">${getValidDateError(data.validDate)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Gender</label>
                            <div class="fs-field-input">
                                <select id="preview-gender">
                                    <option value="1" ${data.gender === '1' ? 'selected' : ''}>Male</option>
                                    <option value="0" ${data.gender === '0' ? 'selected' : ''}>Female</option>
                                </select>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Email</label>
                            <div class="fs-field-input">
                                <input type="email" id="preview-email" value="${Utils.escapeHtml(data.email || '')}" class="${getEmailClass(data.email)}">
                                <span class="fs-field-error" id="error-email">${getEmailError(data.email)}</span>
                            </div>
                        </div>

                        <div class="fs-field-row">
                            <label>Phone</label>
                            <div class="fs-field-input">
                                <input type="text" id="preview-phone" value="${Utils.escapeHtml(data.phone || '')}">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="fs-modal-footer">
                    <button class="fs-btn fs-btn-cancel">Cancel</button>
                    <button class="fs-btn fs-btn-fill" ${!validation.isValid ? 'disabled' : ''}>Fill Form</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        previewModal = modal;

        Utils.$('.fs-modal-close', modal).addEventListener('click', () => closeModal());
        Utils.$('.fs-btn-cancel', modal).addEventListener('click', () => closeModal());

        const fillBtn = Utils.$('.fs-btn-fill', modal);
        fillBtn.addEventListener('click', () => {
            const editedData = {
                ...data,
                surname: Utils.$('#preview-surname').value.trim(),
                name: Utils.$('#preview-name').value.trim(),
                number: Utils.$('#preview-number').value.trim(),
                iin: Utils.$('#preview-iin').value.trim(),
                birthDate: Utils.$('#preview-birth').value.trim(),
                validDate: Utils.$('#preview-valid').value.trim(),
                gender: Utils.$('#preview-gender').value,
                email: Utils.$('#preview-email').value.trim(),
                phone: Utils.$('#preview-phone').value.trim()
            };

            const newValidation = validatePassportData(editedData);
            if (!newValidation.isValid) {
                updateModalValidation(modal, editedData, newValidation);
                return;
            }

            closeModal();
            fillFormSequentially(editedData, touristIndex, zoneElement);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        addModalInputListeners(modal);
    }

    function addModalInputListeners(modal) {
        const iinInput = Utils.$('#preview-iin', modal);
        if (iinInput) {
            iinInput.addEventListener('input', function() {
                this.value = this.value.replace(/\D/g, '').slice(0, 12);
                const errorEl = Utils.$('#error-iin', modal);
                this.className = getIINClass(this.value);
                if (errorEl) errorEl.textContent = getIINError(this.value);
            });
        }

        const validInput = Utils.$('#preview-valid', modal);
        if (validInput) {
            validInput.addEventListener('input', function() {
                const errorEl = Utils.$('#error-valid', modal);
                this.className = getValidDateClass(this.value);
                if (errorEl) errorEl.textContent = getValidDateError(this.value);
            });
        }

        const emailInput = Utils.$('#preview-email', modal);
        if (emailInput) {
            emailInput.addEventListener('input', function() {
                const errorEl = Utils.$('#error-email', modal);
                this.className = getEmailClass(this.value);
                if (errorEl) errorEl.textContent = getEmailError(this.value);
            });
        }
    }

    function updateModalValidation(modal, data, validation) {
        const summary = Utils.$('.fs-validation-summary', modal);
        if (summary) {
            summary.className = 'fs-validation-summary ' + (validation.isValid ? 'success' : 'error');
            summary.innerHTML = '<span class="fs-validation-icon">' + (validation.isValid ? '✓' : '!') + '</span>' +
                '<span>' + (validation.isValid ? 'Data looks good' : 'Please check highlighted fields') + '</span>';
        }

        const fields = ['surname', 'name', 'number'];
        fields.forEach(field => {
            const input = Utils.$('#preview-' + (field === 'number' ? 'number' : field), modal);
            if (input) {
                input.className = getFieldClass(field, data);
                const errorEl = Utils.$('#error-' + (field === 'number' ? 'number' : field), modal);
                if (errorEl) errorEl.textContent = getFieldError(field, data);
            }
        });

        const fillBtn = Utils.$('.fs-btn-fill', modal);
        if (fillBtn) fillBtn.disabled = !validation.isValid;
    }

    function getFieldClass(field, data) {
        const value = data[field];
        if (!value || value.length < 2) return 'error';
        return 'success';
    }

    function getFieldError(field, data) {
        const value = data[field];
        if (!value) return 'Required field';
        if (value.length < 2) return 'Too short';
        return '';
    }

    function getIINClass(iin) {
        if (!iin) return 'error';
        if (iin.length !== 12) return 'warning';
        if (!PassportParser.validateIIN(iin)) return 'error';
        return 'success';
    }

    function getIINError(iin) {
        if (!iin) return 'Required for KZ citizens';
        if (iin.length !== 12) return 'Must be 12 digits';
        if (!PassportParser.validateIIN(iin)) return 'Invalid checksum';
        return '';
    }

    function getValidDateClass(dateStr) {
        if (!dateStr) return 'error';
        const parts = dateStr.split('.');
        if (parts.length !== 3) return 'error';
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();
        const months = (date - now) / (1000 * 60 * 60 * 24 * 30);
        if (months < 0) return 'error';
        if (months < 6) return 'warning';
        return 'success';
    }

    function getValidDateError(dateStr) {
        if (!dateStr) return 'Required';
        const parts = dateStr.split('.');
        if (parts.length !== 3) return 'Invalid format (DD.MM.YYYY)';
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();
        const months = (date - now) / (1000 * 60 * 60 * 24 * 30);
        if (months < 0) return 'PASSPORT EXPIRED!';
        if (months < 6) return 'Expires soon (< 6 months)';
        return '';
    }

    function getEmailClass(email) {
        if (!email) return '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'warning';
        return 'success';
    }

    function getEmailError(email) {
        if (!email) return '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
        return '';
    }

    function closeModal() {
        if (previewModal) {
            previewModal.remove();
            previewModal = null;
        }
    }

    function getHumanValue(data) {
        const gender = data.gender === '1' ? 'MR' : 'MRS';
        if (!data.birthDate) return gender;
        const parts = data.birthDate.split('.');
        if (parts.length !== 3) return gender;
        const birth = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();
        const ageYears = (now - birth) / (1000 * 60 * 60 * 24 * 365.25);
        if (ageYears < 2) return 'INF';
        if (ageYears < 12) return 'CHD';
        return gender;
    }

    async function fillFormSequentially(data, index, zoneElement) {
        const settings = getSiteSettings();

        updateZoneStatus(zoneElement, 'Configuring...', 'orange');

        // Try all selects instantly first, only wait if options not loaded yet
        const humanValue = getHumanValue(data);
        const docId = settings.identityDocId || autoDetectIdentityDoc(index);
        const natId = settings.nationalityId || autoDetectNationality(index);

        // Instant attempt (no waiting — works if options already loaded)
        let hOk = setSelectValue(index, 'HUMAN', humanValue);
        let dOk = docId ? setSelectValue(index, 'IDENTITY_DOCUMENT', docId) : true;
        let nOk = natId ? setSelectValue(index, 'NATIONALITY', natId) : true;

        // Only wait+retry for selects that failed (options not loaded yet)
        if (!hOk) await fillSelectWithRetry(index, 'HUMAN', humanValue, 2000);
        if (!dOk) await fillSelectWithRetry(index, 'IDENTITY_DOCUMENT', docId, 2000);
        if (!nOk) await fillSelectWithRetry(index, 'NATIONALITY', natId, 2000);

        updateZoneStatus(zoneElement, 'Filling...', 'orange');

        setInputValue(index, 'LASTNAME_LNAME', data.surname);
        setInputValue(index, 'FIRSTNAME_LNAME', data.name);
        setInputValue(index, 'BORN', data.birthDate);
        setInputValue(index, 'PNUMBER', data.number);
        setInputValue(index, 'PGIVEN', data.issueDate);
        setInputValue(index, 'PVALID', data.validDate);
        setInputValue(index, 'PGIVENORG', data.authority);
        setInputValue(index, 'INN', data.iin);
        setInputValue(index, 'EMAIL', data.email);
        setInputValue(index, 'PHONE', data.phone);

        if (settings.forceKAZSeries) {
            setInputValue(index, 'PSERIE', 'KAZ');
        } else {
            setInputValue(index, 'PSERIE', data.pserie || '');
        }

        if (!setSelectValue(index, 'MALE', data.gender)) {
            await fillSelectWithRetry(index, 'MALE', data.gender, 2000);
        }

        checkPassportExpiryHighlight(data, index);

        updateZoneStatus(zoneElement, 'Done!', 'green');

        logFillOperation(data);

        await Utils.sleep(300);
        clickRecalculate();
    }

    function fillFromTemplate(template, index, zoneElement) {
        const data = {
            surname: template.surname,
            name: template.name,
            number: template.number,
            iin: template.iin,
            birthDate: template.birthDate,
            issueDate: template.issueDate || '',
            validDate: template.validDate,
            gender: template.gender,
            email: template.email || '',
            phone: template.phone || '',
            authority: 'MIA OF KAZAKHSTAN',
            pserie: template.pserie || '',
            nationality: 'KAZ',
            isValid: true,
            ocrUsed: false
        };
        fillFormSequentially(data, index, zoneElement);
    }

    function logFillOperation(data) {
        const site = detectSiteId();
        const validatedData = validatePassportData(data);

        chrome.runtime.sendMessage({
            action: 'logFillOperation',
            data: {
                site: site,
                surname: data.surname,
                name: data.name,
                number: data.number,
                iin: data.iin,
                birthDate: data.birthDate,
                success: validatedData.isValid,
                warnings: validatedData.warnings
            }
        });
    }

    function validatePassportData(data) {
        const warnings = [];
        let isValid = true;

        if (!data.surname || data.surname.length < 2) warnings.push('Surname is too short or missing');
        if (!data.name || data.name.length < 2) warnings.push('Name is too short or missing');
        if (!data.number) { warnings.push('Passport number is missing'); isValid = false; }
        if (!data.birthDate) { warnings.push('Birth date is missing'); isValid = false; }

        if (data.validDate) {
            const parts = data.validDate.split('.');
            if (parts.length === 3) {
                const expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
                const now = new Date();
                const monthsValid = (expiryDate - now) / (1000 * 60 * 60 * 24 * 30);
                if (monthsValid < 0) { warnings.push('PASSPORT EXPIRED!'); isValid = false; }
                else if (monthsValid < 6) warnings.push('Passport expires in less than 6 months');
            }
        } else {
            warnings.push('Passport expiry date is missing');
        }

        if (data.iin && data.iin.length === 12) {
            if (!PassportParser.validateIIN(data.iin)) warnings.push('IIN checksum validation failed');
        }

        return { isValid, warnings };
    }

    function clickRecalculate() {
        const calcBtn = Utils.$('button.calc');
        if (calcBtn) {
            calcBtn.click();
            const originalText = calcBtn.innerText;
            calcBtn.innerText = 'Recalculating...';
            setTimeout(() => calcBtn.innerText = originalText, 2000);
        }
    }

    function checkPassportExpiryHighlight(data, index) {
        if (!data.validDate) return;

        const parts = data.validDate.split('.');
        if (parts.length !== 3) return;

        const expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        const now = new Date();
        const monthsValid = (expiryDate - now) / (1000 * 60 * 60 * 24 * 30);

        const touristDiv = Utils.$('#tourist' + index);
        if (!touristDiv) return;

        if (monthsValid < 0) {
            touristDiv.style.outline = '3px solid #ef4444';
            touristDiv.style.outlineOffset = '-2px';
            touristDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
            showExpiryToast('PASSPORT EXPIRED! ' + (data.surname || '') + ' ' + (data.name || ''), 'error');
        } else if (monthsValid < 6) {
            touristDiv.style.outline = '3px solid #f59e0b';
            touristDiv.style.outlineOffset = '-2px';
            touristDiv.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
            showExpiryToast('Passport expires in ' + Math.floor(monthsValid) + ' months: ' + (data.surname || '') + ' ' + (data.name || ''), 'warning');
        }
    }

    let expiryToastEl = null;
    function showExpiryToast(text, type) {
        if (expiryToastEl) expiryToastEl.remove();

        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
            'background:' + (type === 'error' ? '#a0392b' : '#c69738') + ';color:white;' +
            'padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;' +
            'font-family:Arial,sans-serif;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
            'animation:slideUp 0.3s ease;';
        toast.textContent = text;
        document.body.appendChild(toast);
        expiryToastEl = toast;

        setTimeout(function() {
            if (expiryToastEl) {
                expiryToastEl.style.transition = 'opacity 0.5s';
                expiryToastEl.style.opacity = '0';
                setTimeout(function() { if (expiryToastEl) expiryToastEl.remove(); }, 500);
            }
        }, 5000);
    }

    function setInputValue(index, namePart, value) {
        if (value === undefined || value === null) return;
        const input = Utils.$(`input[name*="[${index}][${namePart}]"]`);
        if (!input) return;
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function setSelectValue(index, namePart, value) {
        if (value === undefined || value === null || value === '') return false;
        const select = Utils.$(`select[name*="[${index}][${namePart}]"]`);
        if (!select) return false;

        // If options not loaded yet (0 or 1 placeholder), return false
        if (select.options.length <= 1) return false;

        // Find matching option
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
            if (String(select.options[i].value) === String(value)) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) {
            for (let i = 0; i < select.options.length; i++) {
                var optVal = String(select.options[i].value);
                var optText = (select.options[i].text || '').toLowerCase();
                if (optVal.indexOf(String(value)) === 0 || String(value).indexOf(optVal) === 0 ||
                    optText.includes(String(value).toLowerCase())) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }
        }
        if (!found) return false;

        select.value = select.options[select.selectedIndex].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));

        // Update chosen container
        var chosenContainer = select.nextElementSibling;
        if (chosenContainer && chosenContainer.classList.contains('chosen-container')) {
            var chosenSpan = Utils.$('.chosen-single span', chosenContainer);
            var opt = select.options[select.selectedIndex];
            if (opt && chosenSpan) chosenSpan.textContent = opt.text;

            if (typeof window.jQuery !== 'undefined') {
                try {
                    window.jQuery(select).val(select.value);
                    window.jQuery(select).trigger('chosen:updated');
                    window.jQuery(select).trigger('change');
                } catch(e) {}
            }
        }
        if (typeof window.jQuery !== 'undefined' && !chosenContainer) {
            try { window.jQuery(select).val(select.value); window.jQuery(select).trigger('change'); } catch(e) {}
        }
        return true;
    }

    function updateZoneStatus(element, text, color) {
        const span = Utils.$('.fs-status-text', element);
        if (!span) return;
        span.innerText = text;
        span.style.color = color || '#555';
        if (color === 'green' || color === 'red') {
            setTimeout(() => {
                if (span.innerText === text) {
                    span.innerText = 'Drag & drop or click';
                    span.style.color = '#555';
                }
            }, 3000);
        }
    }

    /* ==================== PRICE COMPARISON ==================== */

    let compareWidget = null;

    function initCompareButton() {
        if (Utils.$('#fs-compare-btn')) return;
        if (!Utils.$('.CLAIMPRICE') && !Utils.$('.bron.price_button') && !Utils.$('.expand.price_button')) return;

        const btn = document.createElement('button');
        btn.id = 'fs-compare-btn';
        btn.textContent = '\u21c4 Compare';
        btn.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:10000;' +
            'background:#667eea;color:white;border:none;border-radius:8px;' +
            'padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;' +
            'font-family:Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.2);' +
            'transition:all 0.2s;';
        btn.addEventListener('mouseenter', function() { btn.style.transform = 'translateY(-2px)'; });
        btn.addEventListener('mouseleave', function() { btn.style.transform = 'translateY(0)'; });
        btn.addEventListener('click', function() { showCompareModal(); });
        document.body.appendChild(btn);
    }

    function getCurrentPrice() {
        var priceCell = Utils.$('.CLAIMPRICE');
        if (priceCell) {
            var match = priceCell.innerText.match(/([\d\s,.]+)\s*(USD|EUR|RUB|KZT|UZS|KGS|AZN)/i);
            if (match) return { amount: parseFloat(match[1].replace(/[\s,]/g, '')), currency: match[2].toUpperCase() };
        }
        var bronBtn = Utils.$('.bron.price_button');
        if (bronBtn) {
            var price = bronBtn.getAttribute('data-cat-price');
            var curr = bronBtn.getAttribute('data-currency_title');
            if (price) return { amount: parseFloat(price), currency: curr || 'USD' };
        }
        var expandBtn = Utils.$('.expand.price_button');
        if (expandBtn) {
            var price2 = expandBtn.getAttribute('data-cat-price');
            var curr2 = expandBtn.getAttribute('data-currency_title');
            if (price2) return { amount: parseFloat(price2), currency: curr2 || 'USD' };
        }
        return null;
    }

    function getHotelName() {
        var hotelEl = Utils.$('.hotel-name, .hotel-title, [class*="hotel-name"], a[href*="Hotel/"]');
        if (hotelEl) return hotelEl.innerText.trim().substring(0, 60);
        if (document.title) return document.title.substring(0, 60);
        return 'Unknown hotel';
    }

    function showCompareModal() {
        if (compareWidget) compareWidget.remove();

        var currentPrice = getCurrentPrice();
        var siteId = detectSiteId();
        var hotelName = getHotelName();

        chrome.storage.local.get(['priceCompare'], function(res) {
            var savedPrices = res.priceCompare || {};

            if (currentPrice) {
                savedPrices[siteId] = {
                    price: currentPrice.amount,
                    currency: currentPrice.currency,
                    hotel: hotelName,
                    timestamp: Date.now()
                };
                chrome.storage.local.set({ priceCompare: savedPrices });
            }

            var widget = document.createElement('div');
            widget.id = 'fs-compare-widget';
            widget.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
                'background:white;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.3);' +
                'padding:0;z-index:99999;width:380px;max-height:80vh;overflow-y:auto;' +
                'font-family:Arial,sans-serif;animation:slideUp 0.3s ease;';

            var allOperators = [
                { id: 'Fstravel', url: 'https://online.fstravel.asia/search_hotel?' },
                { id: 'Kompastour', url: 'https://online.kz.kompastour.com/search_hotel?' },
                { id: 'KazUnion', url: 'https://online.kazunion.com/search_hotel?' },
                { id: 'JoinUp', url: 'https://online.joinup.kz/search_hotel?' },
                { id: 'AnexTour', url: 'https://online3.anextour.kz/search_hotel?' },
                { id: 'SelfieTravel', url: 'https://b2b.selfietravel.kz/search_hotel?' }
            ];

            var now = Date.now();
            var pricesHtml = '';
            var hasAnyPrice = false;
            var bestPrice = null;
            var bestOperator = null;

            allOperators.forEach(function(op) {
                var saved = savedPrices[op.id];
                var ageMin = saved ? Math.floor((now - saved.timestamp) / 60000) : 0;
                var isCurrent = op.id === siteId;
                var isStale = ageMin > 30;

                if (saved && !isStale) {
                    hasAnyPrice = true;
                    if (bestPrice === null || saved.price < bestPrice) {
                        bestPrice = saved.price;
                        bestOperator = op.id;
                    }
                    pricesHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f0f0f0;' + (isCurrent ? 'background:#e3f2fd;' : '') + '">' +
                        '<div>' +
                        '<div style="font-weight:600;font-size:13px;color:#333;">' + op.id + (isCurrent ? ' (current)' : '') + '</div>' +
                        '<div style="font-size:9px;color:#999;">' + escapeHtmlLocal(saved.hotel || '') + ' \u00b7 ' + ageMin + ' min ago</div>' +
                        '</div>' +
                        '<div style="text-align:right;">' +
                        '<div style="font-size:16px;font-weight:700;color:' + (bestOperator === op.id ? '#22c55e' : '#667eea') + ';">' + saved.price + ' ' + saved.currency + '</div>' +
                        (bestOperator === op.id && !isCurrent ? '<div style="font-size:9px;color:#22c55e;font-weight:600;">BEST</div>' : '') +
                        '</div>' +
                        '</div>';
                } else {
                    pricesHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f0f0f0;opacity:0.6;">' +
                        '<div>' +
                        '<div style="font-weight:600;font-size:13px;color:#999;">' + op.id + (isCurrent ? ' (current)' : '') + '</div>' +
                        '<div style="font-size:9px;color:#ccc;">' + (isStale ? 'stale (' + ageMin + ' min)' : 'no price yet') + '</div>' +
                        '</div>' +
                        '<a href="' + op.url + '" target="_blank" style="font-size:11px;color:#667eea;text-decoration:none;font-weight:600;">Open \u2192</a>' +
                        '</div>';
                }
            });

            if (!hasAnyPrice && !currentPrice) {
                pricesHtml = '<div style="padding:20px;text-align:center;color:#888;font-size:12px;">No prices yet.<br>Open each operator, search same hotel,<br>click Compare on each page.</div>';
            }

            widget.innerHTML =
                '<div style="padding:16px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;color:white;">' +
                '<div style="font-size:11px;opacity:0.8;text-transform:uppercase;">' + escapeHtmlLocal(hotelName) + '</div>' +
                '<div style="font-size:18px;font-weight:700;margin-top:2px;">Price Comparison</div>' +
                '</div>' +
                '<div style="max-height:400px;overflow-y:auto;">' + pricesHtml + '</div>' +
                '<div style="padding:12px;border-top:1px solid #e0e5ec;font-size:10px;color:#888;text-align:center;">' +
                'Open each operator, search same hotel, click Compare. Saved 30 min.' +
                '<br><button id="fs-clear-compare" style="margin-top:6px;background:none;border:1px solid #ddd;border-radius:4px;padding:3px 10px;font-size:10px;color:#888;cursor:pointer;">Clear all</button>' +
                '</div>';

            document.body.appendChild(widget);
            compareWidget = widget;

            var clearBtn = Utils.$('#fs-clear-compare', widget);
            if (clearBtn) clearBtn.addEventListener('click', function() {
                chrome.storage.local.set({ priceCompare: {} }, function() {
                    widget.remove();
                    compareWidget = null;
                });
            });

            var closeBtn = document.createElement('button');
            closeBtn.textContent = '\u00d7';
            closeBtn.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(255,255,255,0.2);border:none;font-size:20px;cursor:pointer;color:white;width:28px;height:28px;border-radius:50%;';
            closeBtn.addEventListener('click', function() { widget.remove(); compareWidget = null; });
            widget.appendChild(closeBtn);
        });
    }

    function escapeHtmlLocal(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
        });
    }

    /* ==================== EXTRACT RATES FROM PAGE ==================== */

    function extractRatesFromPage() {
        try {
            var rates = {};
            var date = '';

            // Pattern 1: SAMO-Tour currency table
            var samoTable = document.querySelector('table.currency, table[class*="currency"]');
            if (samoTable) {
                var ths = samoTable.querySelectorAll('th[data-currency]');
                var firstRow = samoTable.querySelector('tr');
                if (firstRow) {
                    var dateM = firstRow.innerText.match(/(\d{2}\.\d{2}\.\d{4})/);
                    if (dateM) date = dateM[1];
                }
                if (ths.length > 0) {
                    var symbolMap = { '\u20AC': 'EUR', '$': 'USD', '\u20BD': 'RUB', '\u00A3': 'GBP' };
                    var secondRow = firstRow ? firstRow.nextElementSibling : null;
                    if (secondRow) {
                        var tds = secondRow.querySelectorAll('td');
                        ths.forEach(function(th, idx) {
                            var symbol = th.innerText.trim();
                            var code = symbolMap[symbol];
                            if (!code) return;
                            var td = tds[idx];
                            if (td) {
                                var match = td.innerText.match(/([\d\s,.]+)/);
                                if (match) {
                                    var val = parseFloat(match[1].replace(/[\s,]/g, ''));
                                    if (val > 0) rates[code] = val;
                                }
                            }
                        });
                    }
                }
            }

            // Pattern 2: Fstravel currency-row-block
            if (Object.keys(rates).length === 0) {
                var currBlock = document.querySelector('.currency-row-block');
                if (currBlock) {
                    var html = currBlock.innerHTML;
                    var patterns = [
                        { code: 'USD', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KZT/i },
                        { code: 'EUR', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*KZT/i },
                        { code: 'RUB', regex: /1\s*RUB[^\d]*(\d+\.?\d*)\s*KZT/i }
                    ];
                    patterns.forEach(function(p) {
                        var m = html.match(p.regex);
                        if (m) rates[p.code] = parseFloat(m[1]);
                    });
                    var dateM2 = currBlock.innerText.match(/(\d{2}\.\d{2}\.\d{4})/);
                    if (dateM2) date = dateM2[1];
                }
            }

            if (Object.keys(rates).length > 0) {
                rates.date = date || new Date().toLocaleDateString('ru-RU');
                rates.source = detectSiteId();
                chrome.storage.local.set({ currencyRates: rates, currencyRatesDate: rates.date });
                return rates;
            }
        } catch(e) {
            console.error('[PassportAutoFill] extractRates error:', e);
        }
        return null;
    }

    /* ==================== UNIFIED OBSERVER ==================== */

    const debouncedInit = Utils.debounce(() => {
        closeSamoPopup();
        checkSessionTimeoutLogin();
        extractRatesFromPage();
        initDropZones();
        initPriceWidget();
        initCompareButton();
        CurrencyConverter.init();
    }, 300);

    // Retry init — sometimes tourist form loads late
    function retryInit(retries) {
        if (retries <= 0) return;
        const hasTourists = Utils.$$('div.tourist').length > 0;
        const hasDropzones = Utils.$$('.fs-passport-dropzone').length > 0;
        if (hasTourists && !hasDropzones) {
            console.log('[PassportAutoFill] Retry init (' + retries + ' left) — tourists found, creating dropzones');
            closeSamoPopup();
            checkSessionTimeoutLogin();
            initDropZones();
            initPriceWidget();
            initCompareButton();
            extractRatesFromPage();
            const stillNoDropzones = Utils.$$('.fs-passport-dropzone').length === 0;
            if (stillNoDropzones) {
                setTimeout(function() { retryInit(retries - 1); }, 1000);
            }
        } else if (!hasTourists) {
            setTimeout(function() { retryInit(retries - 1); }, 1000);
        }
    }

    // Periodic popup cleanup (non-blocking)
    setInterval(closeSamoPopup, 2000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { tryAutoLogin(); debouncedInit(); retryInit(10); });
    } else {
        tryAutoLogin();
        debouncedInit();
        retryInit(10);
    }

    const observer = new MutationObserver(debouncedInit);
    observer.observe(document.body, { childList: true, subtree: true });

    /* ==================== KEYBOARD SHORTCUT ==================== */

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === 'openFileDialog') {
            const firstZone = Utils.$('.fs-passport-dropzone');
            if (firstZone) {
                const nearestTourist = firstZone.closest('fieldset, .tourist') || firstZone.parentElement;
                const touristDiv = Utils.$('div.tourist', nearestTourist);
                const index = touristDiv ? touristDiv.dataset.peopleinc : '0';
                openFileDialog(index, firstZone);
            }
            sendResponse({ handled: true });
        }

        if (message.action === 'ping') {
            sendResponse({ pong: true });
        }

        if (message.action === 'fillTemplate') {
            const tpl = message.template;
            const touristDivs = Utils.$$('div.tourist');
            const available = Array.from(touristDivs).filter(d => d.dataset.peopleinc);
            if (available.length === 0) {
                sendResponse({ success: false });
                return;
            }
            const index = available[0].dataset.peopleinc;
            const zone = Utils.$('.fs-passport-dropzone', available[0].parentElement) ||
                         Utils.$('.fs-passport-dropzone', available[0].closest('fieldset'));
            fillFromTemplate(tpl, index, zone);
            sendResponse({ success: true });
        }
    });

    /* ==================== CURRENCY CONVERTER ==================== */

    const CurrencyConverter = {
        rates: { USD: 504.0, EUR: 598.0, RUB: 6.5, UZS: 0.041, KGS: 5.77, AZN: 296.0, GEL: 186.0, TRY: 15.0, THB: 14.0, AED: 137.0, CNY: 69.0, INR: 6.0, VND: 0.02, MYR: 107.0, IDR: 0.031, MVR: 32.0 },
        initialized: false,

        init: function() {
            if (this.initialized) return;

            const path = window.location.pathname;
            const isB2B = path.includes('/bron') || path.includes('/search_tour') || path.includes('/menu');
            if (!isB2B) return;

            this.extractRates();
            this.convertAllPrices();
            this.initialized = true;
        },

        extractRates: function() {
            const currencyBlock = document.querySelector('.currency-row-block');
            if (!currencyBlock) return;

            const html = currencyBlock.innerHTML;
            const patterns = [
                { code: 'USD', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'EUR', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*KZT/i },
                { code: 'RUB', regex: /1\s*RUB[^\d]*(\d+\.?\d*)\s*KZT/i }
            ];

            const crossPatterns = [
                { code: 'UZS', regex: /1\s*EUR[^\d]*(\d+\.?\d*)\s*UZS/i, calc: (rate) => 1 / (rate / this.rates.EUR) },
                { code: 'KGS', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*KGS/i, calc: (rate) => this.rates.USD / rate },
                { code: 'AZN', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AZN/i, calc: (rate) => this.rates.USD / rate },
                { code: 'GEL', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*GEL/i, calc: (rate) => this.rates.USD / rate },
                { code: 'TRY', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*TRY/i, calc: (rate) => this.rates.USD / rate },
                { code: 'THB', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*THB/i, calc: (rate) => this.rates.USD / rate },
                { code: 'AED', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*AED/i, calc: (rate) => this.rates.USD / rate },
                { code: 'CNY', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*CNY/i, calc: (rate) => this.rates.USD / rate },
                { code: 'VND', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*VND/i, calc: (rate) => this.rates.USD / rate },
                { code: 'MYR', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*MYR/i, calc: (rate) => this.rates.USD / rate },
                { code: 'IDR', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*IDR/i, calc: (rate) => this.rates.USD / rate },
                { code: 'INR', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*INR/i, calc: (rate) => this.rates.USD / rate },
                { code: 'MVR', regex: /1\s*USD[^\d]*(\d+\.?\d*)\s*MVR/i, calc: (rate) => this.rates.USD / rate }
            ];

            patterns.forEach(item => {
                const match = html.match(item.regex);
                if (match) this.rates[item.code] = parseFloat(match[1]);
            });

            crossPatterns.forEach(item => {
                const match = html.match(item.regex);
                if (match && this.rates.EUR) {
                    this.rates[item.code] = item.calc(parseFloat(match[1]));
                }
            });

            chrome.storage.local.set({ currencyRates: this.rates });
        },

        convertAllPrices: function() {
            const selectors = [
                '.CLAIMPRICE', '.amount_money', '.commission_money',
                '.cells.price .content', '.PRICE_DETAIL td', '.fcontent .content'
            ];
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    this.convertPriceElement(el);
                });
            });
        },

        convertPriceElement: function(el) {
            if (el.dataset.fsConverted === 'true') return;
            const text = el.textContent || el.innerText;
            const priceMatch = text.match(/([\d\s]+\.?\d*)\s*(EUR|USD|RUB|UZS|KGS|AZN|GEL|TRY|THB|AED|CNY|INR|VND|MYR|IDR|MVR)/i);
            if (!priceMatch) return;

            const amount = parseFloat(priceMatch[1].replace(/\s/g, ''));
            const currency = priceMatch[2].toUpperCase();
            const rate = this.rates[currency];
            if (!rate || isNaN(amount)) return;

            const kzt = Math.round(amount * rate);
            const formattedKzt = this.formatNumber(kzt);

            const kztSpan = document.createElement('span');
            kztSpan.className = 'fs-price-kzt';
            kztSpan.textContent = ` (≈ ${formattedKzt} ₸)`;

            el.appendChild(kztSpan);
            el.dataset.fsConverted = 'true';
        },

        formatNumber: function(num) {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        }
    };

    window.PassportAutoFill = {
        getSiteSettings,
        initDropZones,
        initPriceWidget,
        handlePdf,
        fillFromTemplate
    };
})();
