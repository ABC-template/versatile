// ============================================
// js/core/app.js
// Описание: Инициализация приложения
// Версия: 2.0.0 (убрана sync, добавлен push)
// ============================================

console.log('🚀 App v2.0 начал загрузку');

// ==========================================
// 1. ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОФЛАЙН-РЕЖИМА
// ==========================================

let offlineBanner = null;

function showOfflineBanner(message = 'Нет интернета. Просмотр доступен, изменения невозможны.') {
    if (offlineBanner) return;
    
    offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: #e74c3c;
        color: white;
        padding: 12px 16px;
        text-align: center;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease;
    `;
    offlineBanner.textContent = `⚠️ ${message}`;
    document.body.prepend(offlineBanner);
    
    // Добавляем стили для анимации
    if (!document.getElementById('offline-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'offline-banner-styles';
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateY(-100%); }
                to { transform: translateY(0); }
            }
            @keyframes slideUp {
                from { transform: translateY(0); }
                to { transform: translateY(-100%); }
            }
        `;
        document.head.appendChild(style);
    }
}

function hideOfflineBanner() {
    if (!offlineBanner) return;
    
    offlineBanner.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => {
        if (offlineBanner) {
            offlineBanner.remove();
            offlineBanner = null;
        }
    }, 300);
}

function checkOnline() {
    if (!navigator.onLine) {
        showOfflineBanner();
        return false;
    }
    hideOfflineBanner();
    return true;
}

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ==========================================

async function initApp() {
    const tg = window.Telegram?.WebApp;
    
    // ==========================================
    // НАСТРОЙКА TELEGRAM
    // ==========================================
    
    if (tg) {
        try {
            tg.ready();
            tg.expand();
            if (tg.themeParams && tg.themeParams.bg_color) {
                tg.setHeaderColor(tg.themeParams.bg_color);
            }
        } catch (e) {
            console.error('Ошибка активации Telegram SDK:', e);
        }
    }
    
    // ==========================================
    // INSETS
    // ==========================================
    
    function setTelegramInsets() {
        const root = document.documentElement;
        try {
            if (!tg) {
                root.style.setProperty('--tg-content-safe-area-top', '0px');
                root.style.setProperty('--tg-safe-bottom', '0px');
                return;
            }
            const initDataStr = tg?.initData || '';
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
            console.error('Сбой расчета безопасных зон:', err);
            root.style.setProperty('--tg-content-safe-area-top', '0px');
            root.style.setProperty('--tg-safe-bottom', '0px');
        }
    }
    
    setTelegramInsets();
    setTimeout(setTelegramInsets, 150);
    setTimeout(setTelegramInsets, 450);
    
    // ==========================================
    // ПОЛЬЗОВАТЕЛЬ
    // ==========================================
    
    const user = tg?.initDataUnsafe?.user;
    const userStore = window.userStore;
    const chatStore = window.chatStore;
    
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        const userAvatarEl = document.getElementById('user-avatar');
        const cardAvatarEl = document.getElementById('card-avatar');
        const userNameEl = document.getElementById('user-name');
        
        if (userAvatarEl) userAvatarEl.src = avatarUrl;
        if (cardAvatarEl) cardAvatarEl.src = avatarUrl;
        if (userNameEl) userNameEl.innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }
    
    // ==========================================
    // ЗАГРУЗКА ДАННЫХ
    // ==========================================
    
    chatStore.loadFromStorage();
    userStore.loadFromStorage();
    
    if (window.organizerStore) {
        window.organizerStore.loadFromStorage();
    }
    
    // Очистка пустых чатов
    if (window.chatUI) {
        const cleaned = window.chatUI.cleanupAllEmptyChats();
        if (cleaned > 0) {
            console.log(`🧹 При загрузке очищено ${cleaned} пустых чатов`);
        }
    }
    
    // ==========================================
    // АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ УСТРОЙСТВА
    // ==========================================
    
    const uid = user?.id;
    if (!uid) {
        const limitInfoEl = document.getElementById('limit-info');
        if (limitInfoEl) limitInfoEl.textContent = 'Ошибка: ID не найден';
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.classList.remove('hidden');
            if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
        }
        return;
    }
    
    // Проверяем подписку
    if (window.authService) {
        const result = await window.authService.checkSubscription();
        
        if (result.isMember || result.role === 'admin' || result.role === 'creator') {
            console.log(`👤 Пользователь авторизован: ${result.role}`);
            
            if (window.chatUI) {
                window.chatUI.showChatInterface();
            }
            
            // Регистрация устройства (только для PRO)
            if (result.syncEnabled && window.deviceService) {
                await window.deviceService.register();
                
                // Загружаем метаданные чатов (версии)
                if (window.chatService) {
                    await window.chatService.loadMetadata();
                }
            }
            
            if (window.chatUI) {
                setTimeout(() => window.chatUI.cleanupTempChats(), 5000);
            }
            
        } else {
            if (window.showGuest) {
                window.showGuest({
                    msg: '403',
                    joke: 'Для доступа к ИИ необходимо подписаться на канал!'
                });
            }
        }
    } else {
        console.warn('AuthService не найден, работа в офлайн-режиме');
        if (window.chatUI) {
            window.chatUI.showChatInterface();
        }
    }
    
    // ==========================================
    // PUSH-УВЕДОМЛЕНИЯ (СИНХРОНИЗАЦИЯ)
    // ==========================================
 
if (tg) {
    tg.onEvent('message', async (message) => {
        console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);
        
        if (message.text === '🔄') {
            console.log('✅ СИГНАЛ СИНХРОНИЗАЦИИ РАСПОЗНАН!');
            
            if (window.uiRenderer) {
                window.uiRenderer.showSyncStatus('syncing');
            }
            
            // ✅ ИСПРАВЛЕНО: обновляем только если есть синхронизация
            if (window.chatService && userStore.canSync()) {
                try {
                    await window.chatService.loadMetadata();
                    
                    const activeChat = chatStore.getActiveChat();
                    if (activeChat) {
                        const updated = await window.chatService.openChat(activeChat.id);
                        if (updated && window.chatUI) {
                            window.chatUI.refreshUI();
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Ошибка при обработке push:', err);
                }
            }
            
            if (window.uiRenderer) {
                window.uiRenderer.showSyncStatus('success');
            }
        }
    });
    console.log('📨 Push-подписка активирована');
}
    
    // ==========================================
    // ОНЛАЙН/ОФФЛАЙН ОБРАБОТЧИКИ
    // ==========================================
    
    window.addEventListener('online', async () => {
        console.log('🌐 Интернет восстановлен');
        hideOfflineBanner();
        
        // Обновляем данные при восстановлении сети
        if (userStore.canSync() && window.chatService) {
            await window.chatService.loadMetadata();
            
            const activeChat = chatStore.getActiveChat();
            if (activeChat) {
                await window.chatService.openChat(activeChat.id);
                if (window.chatUI) {
                    window.chatUI.refreshUI();
                }
            }
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 Интернет потерян');
        showOfflineBanner();
    });
    
    // ==========================================
    // ВОССТАНОВЛЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    if (window.chatUI) {
        const hasRestored = window.chatUI.restoreLastChat();
        
        if (hasRestored) {
            window.chatUI.showChatInterface();
            window.chatUI.refreshUI();
        } else {
            window.chatUI.cleanupTempChats();
            window.chatUI.showTagsCloud();
        }
    }
    
    // ==========================================
    // ПЕРИОДИЧЕСКАЯ ОЧИСТКА (только локальная)
    // ==========================================
    
    setInterval(() => {
        if (window.chatUI) {
            window.chatUI.cleanupTempChats();
        }
        // Обновляем счетчик корзины (локально)
        if (window.updateTrashCount) {
            window.updateTrashCount();
        }
    }, 5 * 60 * 1000);
    
    // ==========================================
    // ОТСЛЕЖИВАНИЕ СМЕНЫ ПОЛЬЗОВАТЕЛЯ
    // ==========================================
    
    let lastUserId = null;
    
    function checkUserChanged() {
        const currentUser = tg?.initDataUnsafe?.user;
        const currentUserId = currentUser?.id;
        if (lastUserId && lastUserId !== currentUserId) {
            console.log(`🔄 Пользователь сменился с ${lastUserId} на ${currentUserId}`);
            if (chatStore) chatStore.loadFromStorage();
            if (userStore) userStore.loadFromStorage();
            if (window.organizerStore) window.organizerStore.loadFromStorage();
            if (window.chatUI) window.chatUI.refreshUI();
        }
        lastUserId = currentUserId;
    }
    
    setInterval(checkUserChanged, 1000);
    window.addEventListener('focus', checkUserChanged);
    
    // ==========================================
    // КНОПКА "НОВЫЙ ЧАТ"
    // ==========================================
    
    window.handleNewChatClick = function() {
        const activeFilter = window.profileUI?.currentFilter || 'all';
        
        if (activeFilter === 'all') {
            const card = document.getElementById('profile-card');
            if (card) card.classList.add('hidden');
            if (window.tg?.BackButton) window.tg.BackButton.hide();
            
            if (window.chatUI) {
                window.chatUI.showTagsCloud();
            }
            return;
        }
        
        const topicMap = {
            'code': 'code',
            'creative': 'creative',
            'fast': 'fast',
            'kitchen': 'kitchen',
            'analytics': 'analytics'
        };
        const topic = topicMap[activeFilter] || 'code';
        
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        if (chatStore) {
            chatStore.currentTopic = topic;
            chatStore.createTempChat(topic);
        }
        
        if (window.chatUI) {
            window.chatUI.showChatInterface();
            window.chatUI.refreshUI();
        }
    };
    
    // ==========================================
    // ФИНАЛЬНАЯ ОТРИСОВКА
    // ==========================================
    
    const appScreen = document.getElementById('app-screen');
    if (appScreen) {
        appScreen.classList.remove('hidden');
        if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
    }
    
    // Обновляем счетчик корзины
    if (window.updateTrashCount) {
        setTimeout(window.updateTrashCount, 1000);
    }
    
    // Проверяем интернет при старте
    if (!navigator.onLine) {
        showOfflineBanner();
    }
    
    console.log('✅ Приложение v2.0 успешно загружено');
}

// ==========================================
// СТАРТ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('Критический сбой инициализации:', err);
    });
});

if (window.Telegram?.WebApp?.requestFullscreen) {
    window.Telegram.WebApp.requestFullscreen();
}

console.log('✅ app.js v2.0 полностью загружен');
