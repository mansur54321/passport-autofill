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
        var originalText = btn.textContent;
        btn.textContent = 'Checking...';
        btn.disabled = true;

        chrome.runtime.sendMessage({ action: 'checkUpdate' }, function(response) {
            setTimeout(function() {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 1000);
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
