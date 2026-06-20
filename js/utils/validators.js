// ============================================
// js/utils/validators.js
// Описание: Клиентские валидации
// ============================================

console.log('✅ Validators загружен');

/**
 * Проверка UUID
 */
window.isValidUUID = function(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
};

/**
 * Проверка топика
 */
window.isValidTopic = function(topic) {
    const allowed = ['code', 'creative', 'fast', 'kitchen', 'analytics'];
    return allowed.includes(topic);
};

/**
 * Проверка длины сообщения
 */
window.isValidMessageLength = function(text, maxLength = 10000) {
    if (!text || typeof text !== 'string') return false;
    const length = text.trim().length;
    return length > 0 && length <= maxLength;
};

/**
 * Проверка email
 */
window.isValidEmail = function(email) {
    if (!email) return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

/**
 * Проверка URL
 */
window.isValidURL = function(url) {
    if (!url) return false;
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Проверка размера файла
 */
window.isValidFileSize = function(bytes, maxMB = 5) {
    const maxBytes = maxMB * 1024 * 1024;
    return bytes <= maxBytes;
};

/**
 * Проверка Base64 изображения
 */
window.isValidImageBase64 = function(str) {
    if (!str) return false;
    return str.startsWith('data:image/') && str.includes(';base64,');
};

/**
 * Санитайзинг HTML (клиентский)
 */
window.sanitizeHTML = function(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'p', 'br', 'strong', 'em', 'u', 'i', 'b',
                'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li', 'blockquote',
                'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'span', 'div', 'img', 'hr', 'sub', 'sup'
            ],
            ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'],
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
        });
    }
    
    // Fallback
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
};

console.log('✅ Validators загружен');
