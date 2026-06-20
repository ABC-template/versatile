// ============================================
// js/utils/helpers.js
// Описание: Общие утилиты
// ============================================

console.log('✅ Helpers загружен');

/**
 * Форматирование даты
 */
window.formatDate = function(dateStr) {
    if (!dateStr) return 'неизвестно';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) {
        return 'сегодня ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff === 1) {
        return 'вчера ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7) {
        return diff + ' дня назад';
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
    }
};

/**
 * Склонение слов
 */
window.pluralize = function(count, one, two, five) {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
};

/**
 * Генерация UUID
 */
window.generateUUID = function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * Задержка (Promise)
 */
window.sleep = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Безопасный парсинг JSON
 */
window.safeJSONParse = function(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
};

/**
 * Транкейт строки
 */
window.truncate = function(str, maxLength, suffix = '...') {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + suffix;
};

/**
 * Проверка на пустой объект
 */
window.isEmptyObject = function(obj) {
    if (!obj) return true;
    return Object.keys(obj).length === 0;
};

/**
 * Клонирование объекта
 */
window.cloneObject = function(obj) {
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Дебаунс
 */
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Троттлинг
 */
window.throttle = function(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

console.log('✅ Helpers загружен');
