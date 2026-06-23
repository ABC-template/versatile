// ============================================
// js/core/theme-manager.js
// ============================================

class ThemeManager {
    constructor() {
        this.supportedThemes = ['light', 'dark', 'amoled'];
        this.defaultTheme = 'light';
        this.currentTheme = null;
        
        this.init();
    }
    
    init() {
        // Загружаем сохранённую тему или определяем из Telegram
        const savedTheme = this.loadTheme();
        
        if (savedTheme && this.supportedThemes.includes(savedTheme)) {
            this.applyTheme(savedTheme);
        } else {
            const tgTheme = this.detectTelegramTheme();
            this.applyTheme(tgTheme);
        }
        
        console.log('🎨 ThemeManager инициализирован. Тема:', this.currentTheme);
    }
    
    detectTelegramTheme() {
        const tg = window.Telegram?.WebApp;
        const colorScheme = tg?.colorScheme || 'light';
        return colorScheme === 'dark' ? 'amoled' : 'light';
    }
    
    loadTheme() {
        try {
            return localStorage.getItem('app_theme');
        } catch {
            return null;
        }
    }
    
    saveTheme(theme) {
        try {
            localStorage.setItem('app_theme', theme);
        } catch (e) {
            console.warn('Failed to save theme:', e);
        }
    }
    
    applyTheme(theme) {
        if (!this.supportedThemes.includes(theme)) {
            theme = this.defaultTheme;
        }
        
        this.currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
        this.saveTheme(theme);
        this.updateThemeUI(theme);
        
        console.log('🎨 Тема применена:', theme);
    }
    
    toggleTheme() {
        const currentIndex = this.supportedThemes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % this.supportedThemes.length;
        const nextTheme = this.supportedThemes[nextIndex];
        this.applyTheme(nextTheme);
        return nextTheme;
    }
    
    setTheme(theme) {
        if (this.supportedThemes.includes(theme)) {
            this.applyTheme(theme);
            return true;
        }
        return false;
    }
    
    updateThemeUI(theme) {
        document.querySelectorAll('[data-theme-btn]').forEach(btn => {
            const btnTheme = btn.getAttribute('data-theme-btn');
            btn.classList.toggle('active', btnTheme === theme);
        });
    }
    
    getCurrentTheme() {
        return this.currentTheme;
    }
}

// СОЗДАЁМ ГЛОБАЛЬНЫЙ ЭКЗЕМПЛЯР
window.ThemeManager = ThemeManager;
window.themeManager = new ThemeManager();

console.log('✅ ThemeManager загружен и создан');
