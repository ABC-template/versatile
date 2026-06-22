// ============================================
// js/core/theme-manager.js
// Описание: Управление темами приложения
// Версия: 1.0.0
// ============================================

class ThemeManager {
    constructor() {
        this.supportedThemes = ['light', 'dark', 'amoled'];
        this.defaultTheme = 'light';
        this.currentTheme = null;
        this.themeIcon = null;
        
        this.init();
    }
    
    init() {
        // Находим иконку темы
        this.themeIcon = document.getElementById('theme-icon');
        
        // 1. Пытаемся загрузить сохраненную тему
        const savedTheme = this.loadTheme();
        
        if (savedTheme && this.supportedThemes.includes(savedTheme)) {
            // 2. Если есть сохраненная - применяем ее
            this.applyTheme(savedTheme);
        } else {
            // 3. Иначе определяем тему Telegram
            const tgTheme = this.detectTelegramTheme();
            this.applyTheme(tgTheme);
        }
        
        // 4. Слушаем изменения темы в Telegram
        this.listenToTelegramThemeChanges();
        
        // 5. Слушаем изменения темы в системе (для PWA)
        this.listenToSystemThemeChanges();
        
        console.log(`🎨 ThemeManager инициализирован. Тема: ${this.currentTheme}`);
    }
    
    detectTelegramTheme() {
        const tg = window.Telegram?.WebApp;
        const colorScheme = tg?.colorScheme || 'light';
        
        // Маппинг: если Telegram dark -> используем amoled
        if (colorScheme === 'dark') {
            return 'amoled';
        }
        return 'light';
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
        
        // Применяем тему к body
        document.body.setAttribute('data-theme', theme);
        
        // Сохраняем
        this.saveTheme(theme);
        
        // Обновляем иконку
        this.updateThemeIcon(theme);
        
        // Обновляем UI-индикаторы
        this.updateThemeUI(theme);
        
        // Триггерим событие для других модулей
        document.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme } 
        }));
        
        console.log(`🎨 Тема применена: ${theme}`);
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
    
    updateThemeIcon(theme) {
        if (!this.themeIcon) {
            this.themeIcon = document.getElementById('theme-icon');
        }
        
        if (!this.themeIcon) return;
        
        // Меняем иконку
        const iconMap = {
            'light': 'sun',
            'dark': 'moon',
            'amoled': 'monitor'
        };
        
        const iconName = iconMap[theme] || 'sun';
        
        // Обновляем атрибут data-lucide
        this.themeIcon.setAttribute('data-lucide', iconName);
        
        // Пересоздаем иконку
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    updateThemeUI(theme) {
        // Обновляем кнопки выбора темы
        document.querySelectorAll('[data-theme-btn]').forEach(btn => {
            const btnTheme = btn.getAttribute('data-theme-btn');
            btn.classList.toggle('active', btnTheme === theme);
        });
    }
    
    listenToTelegramThemeChanges() {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;
        
        try {
            tg.onEvent('themeChanged', () => {
                // Применяем тему только если пользователь не сохранял свою
                if (!localStorage.getItem('app_theme')) {
                    const newTheme = this.detectTelegramTheme();
                    this.applyTheme(newTheme);
                }
            });
        } catch (e) {
            console.warn('Could not listen to Telegram theme changes:', e);
        }
    }
    
    listenToSystemThemeChanges() {
        // Слушаем изменения системной темы (для PWA)
        try {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleChange = (e) => {
                // Применяем только если нет сохраненной темы
                if (!localStorage.getItem('app_theme')) {
                    const newTheme = e.matches ? 'amoled' : 'light';
                    this.applyTheme(newTheme);
                }
            };
            
            mediaQuery.addEventListener('change', handleChange);
        } catch (e) {
            // Игнорируем
        }
    }
    
    getCurrentTheme() {
        return this.currentTheme;
    }
    
    isAmoled() {
        return this.currentTheme === 'amoled';
    }
    
    isDark() {
        return this.currentTheme === 'dark' || this.currentTheme === 'amoled';
    }
}

// Экспортируем
window.ThemeManager = ThemeManager;

// Создаем экземпляр после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    window.themeManager = new ThemeManager();
});

// Если DOM уже загружен
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (!window.themeManager) {
            window.themeManager = new ThemeManager();
        }
    });
} else {
    if (!window.themeManager) {
        window.themeManager = new ThemeManager();
    }
}

console.log('✅ ThemeManager загружен');
