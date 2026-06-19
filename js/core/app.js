// js/core/app.js

async function initApp() {
    // 1. Инициализация Eruda строго для Администратора
    const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const MY_TELEGRAM_ID = 1541531808; 
    const isLocalDebug = localStorage.getItem('debug_mode') === 'true';

    if (currentUserId === MY_TELEGRAM_ID || isLocalDebug) {
        if (window.eruda) {
            window.eruda.init();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/eruda';
            script.onload = () => { window.eruda.init(); };
            document.head.appendChild(script);
        }
    }
    
    const root = document.documentElement;
    const tg = window.Telegram?.WebApp;
    
    if (tg) {
        try { 
            tg.ready(); 
            tg.expand(); 
            if (tg.themeParams && tg.themeParams.bg_color) {
                tg.setHeaderColor(tg.themeParams.bg_color); 
            }
        } catch (e) { 
            console.error("Ошибка активации Telegram SDK:", e); 
        }
    }

    // 2. Функция расчета безопасных зон (челки и подбородка на iOS/Android)
    function setTelegramInsets() {
        try {
            if (!tg) { 
                root.style.setProperty('--tg-content-safe-area-top', '0px'); 
                root.style.setProperty('--tg-safe-bottom', '0px'); 
                return; 
            }
            const initDataStr = tg?.initData || "";
            const isMiniApp = !!(initDataStr && initDataStr.length > 0);
            const isMobilePlatform = tg?.platform === 'ios' || tg?.platform === 'android';
            
            let topInset = 0;
            if (isMiniApp && isMobilePlatform) {
                topInset = tg?.contentSafeAreaInset?.top || tg?.safeAreaInset?.top || 0;
                if (topInset < 50) topInset = 60; 
            } else { 
                topInset = 0; 
            }
            const bottomInset = isMiniApp ? (tg?.safeAreaInset?.bottom || 0) : 0;
            
            root.style.setProperty('--tg-content-safe-area-top', `${topInset}px`);
            root.style.setProperty('--tg-safe-bottom', `${bottomInset}px`);
        } catch (err) {
            console.error("Сбой расчета безопасных зон:", err);
            root.style.setProperty('--tg-content-safe-area-top', '0px'); 
            root.style.setProperty('--tg-safe-bottom', '0px');
        }
    }

    setTelegramInsets();
    setTimeout(() => { setTelegramInsets(); }, 150);
    setTimeout(() => { setTelegramInsets(); }, 450);

    // Слушатель системной кнопки "Назад" в шапке Telegram
    if (tg) {
        try {
            tg.onEvent('backButtonClicked', () => { 
                if (typeof setTelegramInsets === 'function') setTelegramInsets(); 
            });
        } catch (e) { 
            console.error("Ошибка привязки кнопки Назад:", e); 
        }
    }

    // 3. Загрузка данных пользователя (Имя, Аватарка)
    const user = tg?.initDataUnsafe?.user;
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp'; 
        const userAvatarEl = document.getElementById('user-avatar');
        const cardAvatarEl = document.getElementById('card-avatar');
        const userNameEl = document.getElementById('user-name');
        
        if (userAvatarEl) userAvatarEl.src = avatarUrl;
        if (cardAvatarEl) cardAvatarEl.src = avatarUrl;
        if (userNameEl) userNameEl.innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }

    // 4. Загрузка локальных данных чата
    if (typeof window.loadLocalHistories === 'function') {
        window.loadLocalHistories();
    }

    // 5. САМОЕ ВАЖНОЕ: Проверка подписки, лимитов и синхронизации
    const uid = user?.id;
    if (!uid) { 
        const limitInfoEl = document.getElementById('limit-info');
        if (limitInfoEl) limitInfoEl.innerText = "Ошибка: ID не найден"; 
        
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.classList.remove('hidden');
            if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
        }
        return; 
    }

    // Динамическая установка флага синхронизации
    window.config = window.config || {};
    if (uid === MY_TELEGRAM_ID || localStorage.getItem('is_pro_user') === 'true') {
        window.config.syncEnabled = true;
    } else {
        window.config.syncEnabled = false;
    }

    // Функция для выполнения синхронизации после проверки подписки
async function performSyncIfNeeded() {
    if (window.config && window.config.syncEnabled) {
        console.log("🔄 Синхронизация включена, загружаем актуальные чаты...");
        
        // 🆕 РЕГИСТРИРУЕМ УСТРОЙСТВО
        if (typeof window.initDeviceManager === 'function') {
            await window.initDeviceManager();
        }
        
        if (typeof window.syncChatsMetadata === 'function') {
            await window.syncChatsMetadata();
        }
        
        if (typeof window.fullSyncAllChats === 'function') {
            await window.fullSyncAllChats();
        }
        
        if (typeof window.startUnsyncedRetryTimer === 'function') {
            window.startUnsyncedRetryTimer();
        }
        
        if (typeof window.initExportButtons === 'function') {
            window.initExportButtons();
        }
    } else {
        console.log("📱 Синхронизация отключена, работаем только с локальным хранилищем");
    }
    
    const appScreen = document.getElementById('app-screen');
    if (appScreen) {
        appScreen.classList.remove('hidden');
        if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
    }
}

    // Восстанавливаем счетчики лимитов из CloudStorage (или LocalStorage) и дергаем бэкенд
    if (tg?.CloudStorage) {
        tg.CloudStorage.getItems(['ai_user_keys', 'usage_data'], async (err, values) => {
            try { window.allUserKeys = JSON.parse(values?.ai_user_keys || '{}'); } catch(e) { window.allUserKeys = {}; }
            
            const today = new Date().toLocaleDateString();
            const usage = JSON.parse(values?.usage_data || '{}');
            window.usedToday = (usage.date === today) ? (usage.count || 0) : 0;
            
            if (typeof window.checkSubscriptionAndLoad === 'function') {
                await window.checkSubscriptionAndLoad(uid);
            }
            
            // Синхронизация после проверки подписки
            await performSyncIfNeeded();
        });
    } else {
        if (typeof window.checkSubscriptionAndLoad === 'function') {
            await window.checkSubscriptionAndLoad(uid);
        }
        
        // Синхронизация после проверки подписки
        await performSyncIfNeeded();
        
        if (typeof window.startOfflineQueueProcessor === 'function') {
    window.startOfflineQueueProcessor();
           }
        
    }

    // ==========================================
    // ПОДПИСКА НА ТИХИЕ PUSH-УВЕДОМЛЕНИЯ
    // ==========================================
if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.onEvent('message', async (message) => {
        console.log("📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:", message);
        console.log("ТЕКСТ СООБЩЕНИЯ:", message.text);
        console.log("ДЛИНА ТЕКСТА:", message.text?.length);
        console.log("КОДЫ СИМВОЛОВ:", message.text?.split('').map(c => c.charCodeAt(0)));
        
        if (message.text === "🔄") {
            console.log("✅ СИГНАЛ РАСПОЗНАН!");
            // здесь твой код синхронизации
        } else {
            console.log("❌ Неизвестный текст, синхронизация не запущена");
        }
    });
}
}

// Функция для отслеживания смены пользователя
let lastUserId = null;

function checkUserChanged() {
    const currentUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const currentUserId = currentUser?.id;
    
    if (lastUserId && lastUserId !== currentUserId) {
        console.log(`🔄 Пользователь сменился с ${lastUserId} на ${currentUserId}, очищаем данные`);
        if (typeof window.clearLocalHistories === 'function') {
            window.clearLocalHistories();
        }
        // Перезагружаем данные для нового пользователя
        if (typeof window.loadLocalHistories === 'function') {
            window.loadLocalHistories();
        }
    }
    
    lastUserId = currentUserId;
}

// Вызывать checkUserChanged() периодически или при фокусе окна
setInterval(checkUserChanged, 1000); // каждую секунду
window.addEventListener('focus', checkUserChanged);
// Запускаем всё после рендеринга страницы
document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('Критический сбой инициализации:', err);
    });
});

if (window.Telegram?.WebApp?.requestFullscreen) {
    window.Telegram.WebApp.requestFullscreen();
        }
