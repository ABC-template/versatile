// ============================================
// js/core/app.js
// Описание: Инициализация приложения
// ============================================

console.log('✅ App начал загрузку');

/**
 * Инициализация приложения
 */
async function initApp() {
    const tg = window.Telegram?.WebApp;
    
    // ==========================================
    // 1. НАСТРОЙКА TELEGRAM
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
    // 2. INSETS
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
    
    if (tg) {
        try {
            tg.onEvent('backButtonClicked', setTelegramInsets);
        } catch (e) {
            console.error('Ошибка привязки кнопки Назад:', e);
        }
    }
    
    // ==========================================
    // 3. ПОЛЬЗОВАТЕЛЬ
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
    // 4. ЗАГРУЗКА ДАННЫХ
    // ==========================================
    
    chatStore.loadFromStorage();
    userStore.loadFromStorage();
    
    if (window.syncStore) {
        window.syncStore.loadFromStorage();
    }
    
    if (window.organizerStore) {
        window.organizerStore.loadFromStorage();
    }
    
    // ==========================================
    // 5. АВТОРИЗАЦИЯ И СИНХРОНИЗАЦИЯ
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
            // Пользователь авторизован
            console.log(`👤 Пользователь авторизован: ${result.role}`);
            
            if (window.chatUI) {
                window.chatUI.showChatInterface();
                if (window.uiRenderer) window.uiRenderer.renderTagsCloud();
            }
            
            // Синхронизация
            if (result.syncEnabled) {
                console.log('🔄 Синхронизация включена');
                
                if (window.initDeviceManager) {
                    await window.initDeviceManager();
                }
                
                if (window.syncService) {
                    await window.syncService.fullSync();
                    window.syncService.startPeriodicSync();
                }
                
                if (window.queueManager) {
                    window.queueManager.start();
                }
                
                if (window.initExportButtons) {
                    window.initExportButtons();
                }
            }
            
            // Отложенная очистка
            if (window.chatUI) {
                setTimeout(() => window.chatUI.cleanupTempChats(), 5000);
            }
            
        } else {
            // Гостевой режим
            if (window.showGuest) {
                window.showGuest({
                    msg: '403',
                    joke: 'Для доступа к ИИ необходимо подписаться на канал!'
                });
            }
        }
    } else {
        // Fallback
        console.warn('AuthService не найден, работа в офлайн-режиме');
        if (window.chatUI) {
            window.chatUI.showChatInterface();
            if (window.uiRenderer) window.uiRenderer.renderTagsCloud();
        }
    }
    
    // ==========================================
    // 6. PUSH-УВЕДОМЛЕНИЯ
    // ==========================================
    
    if (tg) {
        tg.onEvent('message', async (message) => {
            console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);
            
            if (message.text === '🔄' && window.userStore?.canSync()) {
                console.log('✅ СИГНАЛ СИНХРОНИЗАЦИИ РАСПОЗНАН!');
                
                if (window.uiRenderer) {
                    window.uiRenderer.showSyncStatus('syncing');
                }
                
                if (window.syncService) {
                    await window.syncService.fullSync();
                }
                
                const activeChat = chatStore.getActiveChat();
                if (activeChat && window.chatUI) {
                    window.chatUI.refreshUI();
                }
                
                if (window.uiRenderer) {
                    window.uiRenderer.showSyncStatus('success');
                }
            }
        });
        console.log('📨 Push-подписка активирована');
    }
    
    // ==========================================
    // 7. ВОССТАНОВЛЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    if (window.chatUI) {
        const hasRestored = window.chatUI.restoreLastChat();
        
        if (hasRestored) {
            window.chatUI.showChatInterface();
            window.chatUI.refreshUI();
        } else {
            window.chatUI.cleanupTempChats();
            if (window.uiRenderer) {
                window.uiRenderer.renderTagsCloud();
            }
            window.chatUI.showTagsCloud();
        }
    }
    
    // ==========================================
    // 8. ПЕРИОДИЧЕСКАЯ ОЧИСТКА
    // ==========================================
    
    setInterval(() => {
        if (window.chatUI) {
            window.chatUI.cleanupTempChats();
        }
        if (window.updateTrashCount) {
            window.updateTrashCount();
        }
    }, 5 * 60 * 1000);
    
    // ==========================================
    // 9. ОТСЛЕЖИВАНИЕ СМЕНЫ ПОЛЬЗОВАТЕЛЯ
    // ==========================================
    
    let lastUserId = null;
    
    function checkUserChanged() {
        const currentUser = tg?.initDataUnsafe?.user;
        const currentUserId = currentUser?.id;
        if (lastUserId && lastUserId !== currentUserId) {
            console.log(`🔄 Пользователь сменился с ${lastUserId} на ${currentUserId}`);
            if (chatStore) chatStore.loadFromStorage();
            if (userStore) userStore.loadFromStorage();
            if (window.syncStore) window.syncStore.loadFromStorage();
            if (window.organizerStore) window.organizerStore.loadFromStorage();
            if (window.chatUI) window.chatUI.refreshUI();
        }
        lastUserId = currentUserId;
    }
    
    setInterval(checkUserChanged, 1000);
    window.addEventListener('focus', checkUserChanged);
    
    // ==========================================
    // 10. КНОПКА "НОВЫЙ ЧАТ"
    // ==========================================
    
    window.handleNewChatClick = function() {
        const activeFilter = window.profileUI?.currentFilter || 'all';
        
        if (activeFilter === 'all') {
            const card = document.getElementById('profile-card');
            if (card) card.classList.add('hidden');
            if (window.tg?.BackButton) window.tg.BackButton.hide();
            
            if (window.chatUI) {
                window.chatUI.showTagsCloud();
                if (window.uiRenderer) window.uiRenderer.renderTagsCloud();
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
    // 11. ФИНАЛЬНАЯ ОТРИСОВКА
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
    
    console.log('✅ Приложение успешно загружено');
}

// ==========================================
// ЗАПУСК
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('Критический сбой инициализации:', err);
    });
});

// Запрос полноэкранного режима
if (window.Telegram?.WebApp?.requestFullscreen) {
    window.Telegram.WebApp.requestFullscreen();
}

console.log('✅ app.js полностью загружен');
