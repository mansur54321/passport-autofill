/**
 * Passport AutoFill - Content Script
 * Main script for handling PDF passport drag&drop and form filling
 * @module content
 */

(function() {
    'use strict';

    const workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    let lastKnownPrice = 0;
    let previewModal = null;

    /**
     * Gets site-specific settings
     * @returns {Object}
     */
    function getSiteSettings() {
        const host = window.location.hostname;
        
        const defaultSettings = {
            nationalityId: '367404',
            forceKAZSeries: false,
            identityDocId: '1'
        };

        const siteConfigs = {
            'kompastour': {
                nationalityId: '7',
                forceKAZSeries: true
            },
            'kazunion': {
                nationalityId: '7',
                forceKAZSeries: false
            }
        };

        for (const [site, config] of Object.entries(siteConfigs)) {
            if (host.includes(site)) {
                return { ...defaultSettings, ...config };
            }
        }

        return defaultSettings;
    }

    /**
     * Finds the legend container for a tourist element
     * Different sites have different DOM structures
     * @param {Element} touristDiv - Tourist div element
     * @returns {Element|null}
     */
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

    /**
     * Initializes drop zones for passport upload
     */
    function initDropZones() {
        ['dragover', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        const touristDivs = Utils.$$('div.tourist');

        touristDivs.forEach((touristDiv) => {
            const touristIndex = touristDiv.dataset.peopleinc;
            if (!touristIndex) return;

            if (Utils.$('.fs-passport-dropzone', touristDiv.parentElement)) return;

            const legend = findLegendContainer(touristDiv);
            if (legend) {
                if (Utils.$('.fs-passport-dropzone', legend)) return;
                createZoneForTourist(legend, touristIndex);
            } else {
                const container = touristDiv.parentElement;
                if (container && !Utils.$('.fs-passport-dropzone', container)) {
                    createZoneForTouristContainer(container, touristIndex);
                }
            }
        });
    }

    /**
     * Creates drop zone directly in container (fallback)
     * @param {Element} container - Container element
     * @param {string} index - Tourist index
     */
    function createZoneForTouristContainer(container, index) {
        const div = document.createElement('div');
        div.className = 'fs-passport-dropzone';
        div.innerHTML = '<span>Passport PDF</span><span class="fs-status-text">Drag and drop here</span>';
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
            
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                await handlePdf(file, index, div);
            } else {
                updateZoneStatus(div, 'Need PDF file!', 'red');
            }
        });

        container.insertBefore(div, container.firstChild);
    }

    /**
     * Creates a drop zone element for a tourist
     * @param {Element} container - Container element
     * @param {string} index - Tourist index
     */
    function createZoneForTourist(container, index) {
        const div = document.createElement('div');
        div.className = 'fs-passport-dropzone';
        div.innerHTML = '<span>Passport PDF</span><span class="fs-status-text">Drag and drop here</span>';

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
            
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                await handlePdf(file, index, div);
            } else {
                updateZoneStatus(div, 'Need PDF file!', 'red');
            }
        });

        container.appendChild(div);
    }

    /**
     * Initializes price monitoring widget
     */
    function initPriceWidget() {
        if (Utils.$('#fs-price-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'fs-price-widget';
        widget.innerHTML = `
            <h4>Price Monitor</h4>
            <div class="current-price">...</div>
            <div class="secondary-price"></div>
            <div class="price-diff" style="display:none;"></div>
        `;
        document.body.appendChild(widget);

        const priceCell = Utils.$('.CLAIMPRICE');
        
        if (priceCell) {
            updateWidgetPrice(priceCell.innerText);
            const priceObserver = new MutationObserver(() => {
                updateWidgetPrice(priceCell.innerText);
            });
            priceObserver.observe(priceCell, { 
                childList: true, 
                subtree: true, 
                characterData: true 
            });
        }
    }

    /**
     * Updates price widget display
     * @param {string} rawText - Raw price text
     */
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
            if (lines[1]) {
                Utils.$('.secondary-price', widget).innerText = lines[1];
            }

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

    /**
     * Handles PDF file processing
     * @param {File} file - PDF file
     * @param {string} touristIndex - Tourist index
     * @param {Element} zoneElement - Drop zone element
     */
    async function handlePdf(file, touristIndex, zoneElement) {
        updateZoneStatus(zoneElement, 'Processing...', 'blue');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            const fullText = textContent.items.map(item => item.str).join('\n');
            
            const parsedData = PassportParser.parse(fullText);
            
            chrome.storage.local.get(['defaultEmail', 'defaultPhone', 'autoFill'], (defaults) => {
                parsedData.email = defaults.defaultEmail || '';
                parsedData.phone = defaults.defaultPhone || '';
                
                if (defaults.autoFill && parsedData.isValid) {
                    fillFormSequentially(parsedData, touristIndex, zoneElement);
                } else {
                    showPreviewModal(parsedData, touristIndex, zoneElement);
                }
            });

        } catch (err) {
            console.error('[PassportAutoFill] PDF Error:', err);
            updateZoneStatus(zoneElement, 'PDF Error', 'red');
        }
    }

    /**
     * Shows preview modal with extracted data and validation
     * @param {Object} data - Parsed passport data
     * @param {string} touristIndex - Tourist index
     * @param {Element} zoneElement - Drop zone element
     */
    function showPreviewModal(data, touristIndex, zoneElement) {
        if (previewModal) {
            previewModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'fs-preview-modal';
        
        const validation = validatePassportData(data);
        
        modal.innerHTML = `
            <div class="fs-modal-content">
                <div class="fs-modal-header">
                    <h3>Extracted Data</h3>
                    <button class="fs-modal-close">&times;</button>
                </div>
                <div class="fs-modal-body">
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
        
        const surnameInput = Utils.$('#preview-surname', modal);
        if (surnameInput) {
            surnameInput.className = getFieldClass('surname', data);
            const errorEl = Utils.$('#error-surname', modal);
            if (errorEl) errorEl.textContent = getFieldError('surname', data);
        }
        
        const nameInput = Utils.$('#preview-name', modal);
        if (nameInput) {
            nameInput.className = getFieldClass('name', data);
            const errorEl = Utils.$('#error-name', modal);
            if (errorEl) errorEl.textContent = getFieldError('name', data);
        }
        
        const numberInput = Utils.$('#preview-number', modal);
        if (numberInput) {
            numberInput.className = getFieldClass('number', data);
            const errorEl = Utils.$('#error-number', modal);
            if (errorEl) errorEl.textContent = getFieldError('number', data);
        }
        
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

    /**
     * Closes preview modal
     */
    function closeModal() {
        if (previewModal) {
            previewModal.remove();
            previewModal = null;
        }
    }

    /**
     * Fills form with passport data sequentially
     * @param {Object} data - Passport data
     * @param {string} index - Tourist index
     * @param {Element} zoneElement - Drop zone element
     */
    async function fillFormSequentially(data, index, zoneElement) {
        const settings = getSiteSettings();
        
        updateZoneStatus(zoneElement, 'Configuring...', 'orange');

        Utils.tryCatch(() => setSelectValue(index, 'IDENTITY_DOCUMENT', settings.identityDocId));
        Utils.tryCatch(() => setSelectValue(index, 'NATIONALITY', settings.nationalityId));
        
        await Utils.sleep(1500);

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

        setSelectValue(index, 'MALE', data.gender);

        updateZoneStatus(zoneElement, 'Done!', 'green');

        logFillOperation(data);

        await Utils.sleep(500);
        clickRecalculate();
    }

    /**
     * Logs fill operation to history
     * @param {Object} data - Passport data
     */
    function logFillOperation(data) {
        const host = window.location.hostname;
        let site = 'Unknown';
        
        if (host.includes('fstravel')) site = 'Fstravel';
        else if (host.includes('kompastour')) site = 'Kompastour';
        else if (host.includes('kazunion')) site = 'KazUnion';

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

    /**
     * Validates passport data
     * @param {Object} data - Passport data
     * @returns {Object} Validation result
     */
    function validatePassportData(data) {
        const warnings = [];
        let isValid = true;

        if (!data.surname || data.surname.length < 2) {
            warnings.push('Surname is too short or missing');
        }
        if (!data.name || data.name.length < 2) {
            warnings.push('Name is too short or missing');
        }
        if (!data.number) {
            warnings.push('Passport number is missing');
            isValid = false;
        }
        if (!data.birthDate) {
            warnings.push('Birth date is missing');
            isValid = false;
        }

        if (data.validDate) {
            const parts = data.validDate.split('.');
            if (parts.length === 3) {
                const expiryDate = new Date(parts[2], parts[1] - 1, parts[0]);
                const now = new Date();
                const monthsValid = (expiryDate - now) / (1000 * 60 * 60 * 24 * 30);
                
                if (monthsValid < 0) {
                    warnings.push('PASSPORT EXPIRED!');
                    isValid = false;
                } else if (monthsValid < 6) {
                    warnings.push('Passport expires in less than 6 months');
                }
            }
        } else {
            warnings.push('Passport expiry date is missing');
        }

        if (data.iin && data.iin.length === 12) {
            if (!PassportParser.validateIIN(data.iin)) {
                warnings.push('IIN checksum validation failed');
            }
        }

        return { isValid, warnings };
    }

    /**
     * Clicks recalculate button
     */
    function clickRecalculate() {
        const calcBtn = Utils.$('button.calc');
        if (calcBtn) {
            console.log('[PassportAutoFill] Clicking recalculate');
            calcBtn.click();
            
            const originalText = calcBtn.innerText;
            calcBtn.innerText = 'Recalculating...';
            setTimeout(() => calcBtn.innerText = originalText, 2000);
        }
    }

    /**
     * Sets input value with events
     * @param {string} index - Tourist index
     * @param {string} namePart - Input name part
     * @param {string} value - Value to set
     */
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

    /**
     * Sets select value with events
     * @param {string} index - Tourist index
     * @param {string} namePart - Select name part
     * @param {string} value - Value to set
     */
    function setSelectValue(index, namePart, value) {
        if (!value) return;
        
        const select = Utils.$(`select[name*="[${index}][${namePart}]"]`);
        if (!select) return;

        if (select.value === value) return;
        
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        
        if (typeof window.jQuery !== 'undefined') {
            window.jQuery(select).trigger('chosen:updated');
        }
    }

    /**
     * Updates drop zone status
     * @param {Element} element - Drop zone element
     * @param {string} text - Status text
     * @param {string} color - Text color
     */
    function updateZoneStatus(element, text, color) {
        const span = Utils.$('.fs-status-text', element);
        if (!span) return;

        span.innerText = text;
        span.style.color = color || '#555';
        
        if (color === 'green' || color === 'red') {
            setTimeout(() => {
                if (span.innerText === text) {
                    span.innerText = 'Drag and drop here';
                    span.style.color = '#555';
                }
            }, 3000);
        }
    }

    const debouncedInit = Utils.debounce(() => {
        initDropZones();
        initPriceWidget();
    }, 300);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', debouncedInit);
    } else {
        debouncedInit();
    }

    const observer = new MutationObserver(debouncedInit);
    observer.observe(document.body, { childList: true, subtree: true });

    window.PassportAutoFill = {
        getSiteSettings,
        initDropZones,
        initPriceWidget,
        handlePdf
    };
})();
