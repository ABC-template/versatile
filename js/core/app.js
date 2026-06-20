// js/core/app.js
async function initApp() {
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

    if (tg) {
        try {
            tg.onEvent('backButtonClicked', () => { 
                if (typeof setTelegramInsets === 'function') setTelegramInsets(); 
            });
        } catch (e) { 
            console.error("Ошибка привязки кнопки Назад:", e); 
        }
    }

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

    if (typeof window.loadLocalHistories === 'function') {
        window.loadLocalHistories();
    }

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

    window.config = window.config || {};
    if (uid === MY_TELEGRAM_ID || localStorage.getItem('is_pro_user') === 'true') {
        window.config.syncEnabled = true;
    } else {
        window.config.syncEnabled = false;
    }

    async function performSyncIfNeeded() {
        if (window.config && window.config.syncEnabled) {
            console.log("🔄 Синхронизация включена, загружаем актуальные чаты...");
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
            if (typeof window.cleanupTempChats === 'function') {
                window.cleanupTempChats();
            }
        } else {
            console.log("📱 Синхронизация отключена, работаем только с локальным хранилищем");
            if (typeof window.cleanupTempChats === 'function') {
                window.cleanupTempChats();
            }
        }
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.classList.remove('hidden');
            if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
        }
    }

    if (tg?.CloudStorage) {
        tg.CloudStorage.getItems(['ai_user_keys', 'usage_data'], async (err, values) => {
            try { window.allUserKeys = JSON.parse(values?.ai_user_keys || '{}'); } catch(e) { window.allUserKeys = {}; }
            const today = new Date().toLocaleDateString();
            const usage = JSON.parse(values?.usage_data || '{}');
            window.usedToday = (usage.date === today) ? (usage.count || 0) : 0;
            if (typeof window.checkSubscriptionAndLoad === 'function') {
                await window.checkSubscriptionAndLoad(uid);
            }
            await performSyncIfNeeded();
            if (typeof window.startOfflineQueueProcessor === 'function') {
                window.startOfflineQueueProcessor();
            }
        });
    } else {
        if (typeof window.checkSubscriptionAndLoad === 'function') {
            await window.checkSubscriptionAndLoad(uid);
        }
        await performSyncIfNeeded();
        if (typeof window.startOfflineQueueProcessor === 'function') {
            window.startOfflineQueueProcessor();
        }
    }

    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.onEvent('message', async (message) => {
            console.log("📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:", message);
            console.log("ТЕКСТ СООБЩЕНИЯ:", message.text);
            console.log("ДЛИНА ТЕКСТА:", message.text?.length);
            console.log("КОДЫ СИМВОЛОВ:", message.text?.split('').map(c => c.charCodeAt(0)));
            if (message.text === "🔄") {
                console.log("✅ СИГНАЛ РАСПОЗНАН!");
                if (window.config?.syncEnabled) {
                    if (typeof window.showSyncStatus === 'function') {
                        window.showSyncStatus('syncing');
                    }
                    if (typeof window.syncChatsMetadata === 'function') {
                        await window.syncChatsMetadata();
                    }
                    const activeChat = window.getCurrentActiveChat();
                    if (activeChat && typeof window.loadFullChat === 'function') {
                        await window.loadFullChat(activeChat.id);
                        if (typeof window.loadActiveChatMessages === 'function') {
                            window.loadActiveChatMessages();
                        }
                    }
                    if (typeof window.showSyncStatus === 'function') {
                        window.showSyncStatus('success');
                    }
                }
            } else {
                console.log("❌ Неизвестный текст, синхронизация не запущена");
            }
        });
    }

    // ==========================================
    // ПОКАЗЫВАЕМ ОБЛАКО ТЕГОВ ИЛИ ЧАТ
    // ==========================================
    
    const inputArea = document.getElementById('input-area');
    const fabBtn = document.getElementById('fab-open-input');
    const chatContainer = document.getElementById('chat-container');
    const tagsCloud = document.getElementById('tags-cloud-container');
    
    window.showTagsCloud = function() {
        if (tagsCloud) tagsCloud.style.display = 'flex';
        if (chatContainer) {
            chatContainer.style.display = 'none';
            chatContainer.classList.remove('visible');
        }
        if (inputArea) inputArea.style.display = 'none';
        if (fabBtn) fabBtn.style.display = 'none';
    };
    
    window.showChatInterface = function() {
        if (tagsCloud) tagsCloud.style.display = 'none';
        if (chatContainer) {
            chatContainer.style.display = 'flex';
            chatContainer.classList.add('visible');
        }
        if (inputArea) inputArea.style.display = 'flex';
        if (fabBtn) fabBtn.style.display = 'flex';
    };
    
    const lastTopic = localStorage.getItem('last_topic');
    const lastChatId = lastTopic ? localStorage.getItem(`last_chat_${lastTopic}`) : null;
    let hasSavedChat = false;
    
    if (lastTopic && lastChatId) {
        const chat = window.chatHistories[lastTopic]?.find(c => c.id === lastChatId && !c.deleted_at);
        if (chat && window.hasRealMessages(chat)) {
            window.currentTopic = lastTopic;
            window.activeChatIds[lastTopic] = lastChatId;
            hasSavedChat = true;
        }
    }
    
    if (hasSavedChat) {
        window.showChatInterface();
        window.refreshUiAfterChatSelection();
    } else {
        if (typeof window.cleanupTempChats === 'function') {
            window.cleanupTempChats();
        }
        window.showTagsCloud();
        if (typeof window.renderTagsCloud === 'function') {
            window.renderTagsCloud();
        }
    }
    
    setInterval(() => {
        if (typeof window.cleanupTempChats === 'function') {
            window.cleanupTempChats();
        }
    }, 5 * 60 * 1000);
}

// ==========================================
// ОТСЛЕЖИВАНИЕ СМЕНЫ ПОЛЬЗОВАТЕЛЯ
// ==========================================

let lastUserId = null;

function checkUserChanged() {
    const currentUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const currentUserId = currentUser?.id;
    if (lastUserId && lastUserId !== currentUserId) {
        console.log(`🔄 Пользователь сменился с ${lastUserId} на ${currentUserId}, очищаем данные`);
        if (typeof window.clearLocalHistories === 'function') {
            window.clearLocalHistories();
        }
        if (typeof window.loadLocalHistories === 'function') {
            window.loadLocalHistories();
        }
        if (typeof window.loadOfflineQueue === 'function') {
            window.loadOfflineQueue();
        }
    }
    lastUserId = currentUserId;
}

setInterval(checkUserChanged, 1000);
window.addEventListener('focus', checkUserChanged);

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('Критический сбой инициализации:', err);
    });
});

if (window.Telegram?.WebApp?.requestFullscreen) {
    window.Telegram.WebApp.requestFullscreen();
}

console.log('✅ app.js полностью загружен с исправлениями');
