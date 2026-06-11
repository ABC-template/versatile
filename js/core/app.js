// js/core/app.js

// 1. Глобальная конфигурация приложения по умолчанию
window.config = {
    apiEndpoint: '/api',
    maxContextMessages: 10,
    syncEnabled: false // По умолчанию выключено для защиты базы данных
};

// 2. Основной модуль управления жизненным циклом Mini App
const App = {
    /**
     * Стартовая инициализация всех систем
     */
    async init() {
        // Восстанавливаем Eruda в первую очередь, чтобы не пропустить ни одного лога
        this.initEruda();

        console.log('Инициализация Versatile AI Mini App...');
        
        // Настройка интеграции с Telegram WebApp API
        this.initTelegramWebApp();

        // Динамическое определение прав на синхронизацию (Admin / PRO)
        this.configureSyncLimits();

        // Запуск гибридного слоя хранения данных (Облако или LocalStorage)
        this.initStorageSystem();

        // Отрисовка и привязка событий пользовательского интерфейса
        this.initUserInterface();
    },

    /**
     * Инициализация консоли отладки Eruda для мобильных устройств
     */
    initEruda() {
        // Вариант 1: Если скрипт Eruda уже подключен глобально (например, в index.html)
        if (window.eruda) {
            try {
                window.eruda.init();
                console.log('Eruda успешно запущена из глобального контекста.');
            } catch (err) {
                console.error('Не удалось запустить предустановленную Eruda:', err);
            }
        } else {
            // Вариант 2: Если скрипта нет, подтягиваем его на лету для мобильной отладки
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/eruda';
            script.async = true;
            script.onload = () => {
                if (window.eruda) {
                    try {
                        window.eruda.init();
                        console.log('Eruda успешно загружена динамически и инициализирована.');
                    } catch (err) {
                        console.error('Ошибка при инициализации динамической Eruda:', err);
                    }
                }
            };
            script.onerror = () => {
                console.error('Критическая ошибка: Не удалось загрузить Eruda с удаленного CDN.');
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
            
            // Сообщаем Telegram, что приложение готове к работе
            webApp.ready();
            
            // Раскрываем окно на максимум для удобства работы с чатами
            webApp.expand();
            
            // Привязываем базовые CSS переменные к теме Telegram
            document.documentElement.style.setProperty('--tg-theme-bg', webApp.backgroundColor || '#ffffff');
            document.documentElement.style.setProperty('--tg-theme-text', webApp.textColor || '#000000');
            document.documentElement.style.setProperty('--tg-theme-button', webApp.buttonColor || '#2481cc');
            document.documentElement.style.setProperty('--tg-theme-button-text', webApp.buttonTextColor || '#ffffff');
            
            console.log('Telegram WebApp успешно инициализирован.');
        } else {
            console.warn('Telegram WebApp среда не обнаружена. Запущено в режиме обычного браузера.');
        }
    },

    /**
     * Разделение пользователей на локальный режим и облачную синхронизацию
     */
    configureSyncLimits() {
        // Извлекаем Telegram ID текущего пользователя из безопасной прослойки Telegram
        const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        
        // Твой персональный Telegram ID (Администратор/Создатель системы)
        const adminId = 1541531808; 

        // Проверяем: это либо ты (админ), либо пользователь с локальным флагом купленного премиума
        const isCreatorOrAdmin = currentUserId && (String(currentUserId) === String(adminId));
        const isLocalPremium = localStorage.getItem('is_pro_user') === 'true';

        if (isCreatorOrAdmin || isLocalPremium) {
            window.config.syncEnabled = true;
            console.log('Синхронизация включена: Облачный режим (Разрешено для Admin/PRO).');
        } else {
            window.config.syncEnabled = false;
            console.log('Синхронизация отключена: Автономный режим (Данные сохраняются локально в LocalStorage).');
        }
    },

    /**
     * Запуск модуля синхронизации и баз данных
     */
    initStorageSystem() {
        if (window.Storage && typeof window.Storage.init === 'function') {
            window.Storage.init();
            console.log('Модуль хранилища успешно запущен.');
        } else {
            console.error('Критическая ошибка: Компонент window.Storage не обнаружен в системе.');
        }
    },

    /**
     * Инициализация визуальной разметки и интерактивных элементов
     */
    initUserInterface() {
        if (window.UI && typeof window.UI.init === 'function') {
            window.UI.init();
            console.log('Пользовательский интерфейс успешно отрисован.');
        } else {
            console.warn('Предупреждение: Модуль window.UI не обнаружен или будет инициализирован позже.');
        }
    }
};

// Безопасный запуск всего ядра приложения строго после полной готовности DOM-структуры
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(err => {
        console.error('Критический сбой при запуске приложения:', err);
    });
});
