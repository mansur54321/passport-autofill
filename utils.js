/**
 * Utility functions module
 * @module utils
 */

const Utils = (function() {

    /**
     * Debounce function - limits execution rate
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function - limits execution to once per wait period
     * @param {Function} func - Function to throttle
     * @param {number} limit - Minimum time between executions
     * @returns {Function} Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Sleep utility
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Safely query selector with error handling
     * @param {string} selector - CSS selector
     * @param {Element} context - Context element (default: document)
     * @returns {Element|null}
     */
    function $(selector, context = document) {
        try {
            return context.querySelector(selector);
        } catch (e) {
            console.error('[PassportAutoFill] Invalid selector:', selector);
            return null;
        }
    }

    /**
     * Safely query selector all
     * @param {string} selector - CSS selector
     * @param {Element} context - Context element
     * @returns {NodeList}
     */
    function $$(selector, context = document) {
        try {
            return context.querySelectorAll(selector);
        } catch (e) {
            console.error('[PassportAutoFill] Invalid selector:', selector);
            return [];
        }
    }

    /**
     * Validates email address
     * @param {string} email - Email to validate
     * @returns {boolean}
     */
    function isValidEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validates phone number (KZ format)
     * @param {string} phone - Phone to validate
     * @returns {boolean}
     */
    function isValidPhone(phone) {
        if (!phone) return false;
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        return /^\d{10,12}$/.test(cleanPhone);
    }

    /**
     * Formats phone number to standard format
     * @param {string} phone - Phone number
     * @returns {string}
     */
    function formatPhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return cleaned;
        }
        if (cleaned.length === 11 && cleaned.startsWith('7')) {
            return cleaned.substring(1);
        }
        return cleaned;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Generate unique ID
     * @returns {string}
     */
    function generateId() {
        return 'id_' + Math.random().toString(36).substring(2, 11);
    }

    /**
     * Deep clone object
     * @param {Object} obj - Object to clone
     * @returns {Object}
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Safe try-catch wrapper
     * @param {Function} fn - Function to execute
     * @param {*} fallback - Fallback value on error
     * @returns {*}
     */
    function tryCatch(fn, fallback = null) {
        try {
            return fn();
        } catch (e) {
            console.error('[PassportAutoFill] Error:', e);
            return fallback;
        }
    }

    /**
     * Async try-catch wrapper
     * @param {Function} fn - Async function to execute
     * @param {*} fallback - Fallback value on error
     * @returns {Promise<*>}
     */
    async function tryCatchAsync(fn, fallback = null) {
        try {
            return await fn();
        } catch (e) {
            console.error('[PassportAutoFill] Async Error:', e);
            return fallback;
        }
    }

    return {
        debounce,
        throttle,
        sleep,
        $,
        $$,
        isValidEmail,
        isValidPhone,
        formatPhone,
        escapeHtml,
        generateId,
        deepClone,
        tryCatch,
        tryCatchAsync
    };
})();

if (typeof window !== 'undefined') {
    window.Utils = Utils;
}
