const Utils = (function() {

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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function $(selector, context = document) {
        try {
            return context.querySelector(selector);
        } catch (e) {
            console.error('[PassportAutoFill] Invalid selector:', selector);
            return null;
        }
    }

    function $$(selector, context = document) {
        try {
            return context.querySelectorAll(selector);
        } catch (e) {
            console.error('[PassportAutoFill] Invalid selector:', selector);
            return [];
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
        });
    }

    function tryCatch(fn, fallback = null) {
        try {
            return fn();
        } catch (e) {
            console.error('[PassportAutoFill] Error:', e);
            return fallback;
        }
    }

    return {
        debounce,
        sleep,
        $,
        $$,
        escapeHtml,
        tryCatch
    };
})();

if (typeof self !== 'undefined') {
    self.Utils = Utils;
}
