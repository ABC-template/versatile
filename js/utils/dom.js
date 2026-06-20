// ============================================
// js/utils/dom.js
// Описание: DOM-утилиты
// ============================================

console.log('✅ DOM utils загружен');

/**
 * Получить элемент по ID с проверкой
 */
window.$ = function(id) {
    return document.getElementById(id);
};

/**
 * Создать элемент с классами и атрибутами
 */
window.createElement = function(tag, className = '', attributes = {}, innerHTML = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    
    for (const [key, value] of Object.entries(attributes)) {
        el.setAttribute(key, value);
    }
    
    return el;
};

/**
 * Добавить класс с анимацией
 */
window.addClassWithAnimation = function(el, className, duration = 300) {
    el.classList.add(className);
    setTimeout(() => {
        el.classList.remove(className);
    }, duration);
};

/**
 * Плавное появление элемента
 */
window.fadeIn = function(el, duration = 300) {
    el.style.opacity = '0';
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.display = '';
    requestAnimationFrame(() => {
        el.style.opacity = '1';
    });
    setTimeout(() => {
        el.style.transition = '';
    }, duration);
};

/**
 * Плавное исчезновение элемента
 */
window.fadeOut = function(el, duration = 300) {
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = '0';
    setTimeout(() => {
        el.style.display = 'none';
        el.style.transition = '';
    }, duration);
};

/**
 * Скролл к элементу
 */
window.scrollToElement = function(el, behavior = 'smooth', offset = 0) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = rect.top + window.pageYOffset - offset;
    window.scrollTo({ top: targetY, behavior });
};

/**
 * Скролл в контейнере
 */
window.scrollContainerToBottom = function(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
};

/**
 * Проверка видимости элемента
 */
window.isElementVisible = function(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
};

/**
 * Получить размеры элемента
 */
window.getElementSize = function(el) {
    if (!el) return { width: 0, height: 0 };
    return {
        width: el.offsetWidth,
        height: el.offsetHeight
    };
};

/**
 * Обновить CSS-переменные
 */
window.setCSSVar = function(name, value) {
    document.documentElement.style.setProperty(name, value);
};

/**
 * Получить CSS-переменную
 */
window.getCSSVar = function(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

console.log('✅ DOM utils загружен');
