// js/core/app.js

// 1. Безопасное расширение глобальной конфигурации (не затирая существующие свойства)
window.config = window.config || {};
window.config.apiEndpoint = window.config.apiEndpoint || '/api';
window.config.maxContextMessages = window.config.maxContextMessages || 10;
window.config.syncEnabled = false; // Базовое значение для безопасности

// 2. Основной модуль управления жизненным циклом Mini App
const App = {
    /**
     * Стартовая инициализация всех систем
     */
    async init() {
        // Включаем консоль отладки строго для администратора
        this.initEruda();

        try {
            console.log('Запуск инициализации Versatile AI Mini App...');
            
            // Настройка интеграции с Telegram WebApp API
            this.initTelegramWebApp();

            // Динамическое определение прав на синхронизацию (Admin / PRO)
            this.configureSyncLimits();

            // Запуск гибридного слоя хранения данных (Облако или LocalStorage)
            this.initStorageSystem();

            // Отрисовка и привязка событий пользовательского интерфейса
            this.initUserInterface();

            // Гарантированно снимаем серый экран после успешной сборки
            this.revealAppScreen();

        } catch (err) {
            console.error('Критический сбой во время инициализации модулей:', err);
            // Предохранитель: даже если что-то пошло не так, открываем экран, чтобы работала Eruda
            this.revealAppScreen();
        }
    },

    /**
     * Инициализация консоли отладки Eruda (ВИДИМА ТОЛЬКО ДЛЯ АДМИНА)
     */
    initEruda() {
        const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        const adminId = 1541531808; // Твой Telegram ID
        const isLocalDebug = localStorage.getItem('debug_mode') === 'true';

        // Если это не ты и не включен режим локальной отладки — Eruda не загружается
        if (String(currentUserId) !== String(adminId) && !isLocalDebug) {
            return; 
        }

        if (window.eruda) {
            try {
                window.eruda.init();
                console.log('Eruda запущена для администратора.');
            } catch (err) {
                console.error('Ошибка активации предустановленной Eruda:', err);
            }
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/eruda';
            script.async = true;
            script.onload = () => {
                if (window.eruda) {
                    try {
                        window.eruda.init();
                        console.log('Eruda динамически загружена для администратора.');
                    } catch (e) {
                        console.error('Ошибка активации динамической Eruda:', e);
                    }
                }
            };
            document.head.appendChild(script);
        }
    },

    /**
     * Настройка и развертывание Telegram WebApp интерфейса
     */
    initTelegramWebApp() {
        if (window.Telegram && window.Telegram.WebApp) {
            const webApp = window.Telegram.WebApp;
            
            webApp.ready();
            webApp.expand();
            
            // Привязываем базовые CSS переменные к теме Telegram
            document.documentElement.style.setProperty('--tg-theme-bg', webApp.backgroundColor || '#ffffff');
            document.documentElement.style.setProperty('--tg-theme-text', webApp.textColor || '#000000');
            document.documentElement.style.setProperty('--tg-theme-button', webApp.buttonColor || '#2481cc');
            document.documentElement.style.setProperty('--tg-theme-button-text', webApp.buttonTextColor || '#ffffff');
            
            console.log('Telegram WebApp успешно настроен.');
        } else {
            console.warn('Среда Telegram WebApp не обнаружена. Работа в обычном браузере.');
        }
    },

    /**
     * Разделение пользователей на локальный режим и облачную синхронизацию
     */
    configureSyncLimits() {
        const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        const adminId = 1541531808; 

        const isCreatorOrAdmin = currentUserId && (String(currentUserId) === String(adminId));
        const isLocalPremium = localStorage.getItem('is_pro_user') === 'true';

        if (isCreatorOrAdmin || isLocalPremium) {
            window.config.syncEnabled = true;
            console.log('Режим работы: Облачная синхронизация (Admin/PRO).');
        } else {
            window.config.syncEnabled = false;
            console.log('Режим работы: Локальное хранилище (LocalStorage).');
        }
    },

    /**
     * Запуск модуля синхронизации и баз данных
     */
    initStorageSystem() {
        if (window.Storage && typeof window.Storage.init === 'function') {
            window.Storage.init();
            console.log('Модуль децентрализованного хранилища готов.');
        } else {
            console.error('Ошибка: Компонент window.Storage не найден.');
        }
    },

    /**
     * Инициализация визуальной разметки интерфейса
     */
    initUserInterface() {
        if (window.UI && typeof window.UI.init === 'function') {
            window.UI.init();
            console.log('Модуль UI успешно проинициализирован.');
        } else {
            console.warn('Предупреждение: window.UI не обнаружен или ожидает ленивой загрузки.');
        }
    },

    /**
     * АНТИ-СЕРЫЙ ЭКРАН: Принудительное отображение интерфейса приложения
     */
    revealAppScreen() {
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            // Удаляем класс скрытия
            appScreen.classList.remove('hidden');
            
            // Если в инлайновых стилях или CSS зашит display: none — сбрасываем его
            if (appScreen.style.display === 'none') {
                appScreen.style.display = '';
            }
            console.log('Защита сработала: Серый экран успешно убран, приложение доступно.');
        } else {
            console.error('Критическая ошибка разметки: Элемент #app-screen не найден в DOM.');
        }
    }
};

// Безопасный запуск строго после полной готовности дерева документов DOM
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(err => {
        console.error('Непредвиденный сбой ядра на этапе DOMContentLoaded:', err);
    });
});
