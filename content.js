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
            const fieldset = touristDiv.closest('fieldset');
            if (!fieldset) return;
            
            const legend = Utils.$('.legend-tag', fieldset);
            if (!legend) return;

            if (Utils.$('.fs-passport-dropzone', legend)) return;

            createZoneForTourist(legend, touristIndex);
        });
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
     * Shows preview modal with extracted data
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
        modal.innerHTML = `
            <div class="fs-modal-content">
                <div class="fs-modal-header">
                    <h3>Extracted Data</h3>
                    <button class="fs-modal-close">&times;</button>
                </div>
                <div class="fs-modal-body">
                    ${data.errors.length > 0 ? `
                        <div class="fs-errors">
                            <strong>Errors:</strong>
                            <ul>${data.errors.map(e => '<li>' + Utils.escapeHtml(e) + '</li>').join('')}</ul>
                        </div>
                    ` : ''}
                    ${data.warnings.length > 0 ? `
                        <div class="fs-warnings">
                            <strong>Warnings:</strong>
                            <ul>${data.warnings.map(w => '<li>' + Utils.escapeHtml(w) + '</li>').join('')}</ul>
                        </div>
                    ` : ''}
                    <div class="fs-data-grid">
                        <label>Surname: <input type="text" id="preview-surname" value="${Utils.escapeHtml(data.surname)}"></label>
                        <label>Name: <input type="text" id="preview-name" value="${Utils.escapeHtml(data.name)}"></label>
                        <label>Passport: <input type="text" id="preview-number" value="${Utils.escapeHtml(data.number)}"></label>
                        <label>IIN: <input type="text" id="preview-iin" value="${Utils.escapeHtml(data.iin)}"></label>
                        <label>Birth Date: <input type="text" id="preview-birth" value="${Utils.escapeHtml(data.birthDate)}"></label>
                        <label>Valid Until: <input type="text" id="preview-valid" value="${Utils.escapeHtml(data.validDate)}"></label>
                        <label>Gender: 
                            <select id="preview-gender">
                                <option value="1" ${data.gender === '1' ? 'selected' : ''}>Male</option>
                                <option value="0" ${data.gender === '0' ? 'selected' : ''}>Female</option>
                            </select>
                        </label>
                        <label>Email: <input type="email" id="preview-email" value="${Utils.escapeHtml(data.email || '')}"></label>
                        <label>Phone: <input type="text" id="preview-phone" value="${Utils.escapeHtml(data.phone || '')}"></label>
                    </div>
                </div>
                <div class="fs-modal-footer">
                    <button class="fs-btn fs-btn-cancel">Cancel</button>
                    <button class="fs-btn fs-btn-fill">Fill Form</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        previewModal = modal;

        Utils.$('.fs-modal-close', modal).addEventListener('click', () => closeModal());
        Utils.$('.fs-btn-cancel', modal).addEventListener('click', () => closeModal());
        Utils.$('.fs-btn-fill', modal).addEventListener('click', () => {
            const editedData = {
                ...data,
                surname: Utils.$('#preview-surname').value,
                name: Utils.$('#preview-name').value,
                number: Utils.$('#preview-number').value,
                iin: Utils.$('#preview-iin').value,
                birthDate: Utils.$('#preview-birth').value,
                validDate: Utils.$('#preview-valid').value,
                gender: Utils.$('#preview-gender').value,
                email: Utils.$('#preview-email').value,
                phone: Utils.$('#preview-phone').value
            };
            closeModal();
            fillFormSequentially(editedData, touristIndex, zoneElement);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
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

        await Utils.sleep(500);
        clickRecalculate();
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
