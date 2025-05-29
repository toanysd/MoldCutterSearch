// Utility functions for MoldCutterSearch

// Date formatting utilities
const DateUtils = {
    formatDate(dateString, locale = 'ja-JP') {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(locale);
        } catch {
            return dateString;
        }
    },
    
    formatDateTime(dateString, locale = 'ja-JP') {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleString(locale);
        } catch {
            return dateString;
        }
    }
};

// Data validation utilities
const ValidationUtils = {
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    },
    
    isEmpty(value) {
        return value === null || value === undefined || value === '';
    }
};

// String utilities
const StringUtils = {
    truncate(str, length = 50) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    },
    
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },
    
    removeSpecialChars(str) {
        if (!str) return '';
        return str.replace(/[^\w\s]/gi, '');
    }
};

// Export utilities
window.DateUtils = DateUtils;
window.ValidationUtils = ValidationUtils;
window.StringUtils = StringUtils;
