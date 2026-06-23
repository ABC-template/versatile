// ============================================
// js/core/app.js
// Описание: Инициализация приложения
// Версия: 3.0.0
// ============================================

console.log('🚀 App v3.0 начал загрузку');

// Глобальные функции для офлайн-режима
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
        background: var(--app-accent-danger, #e74c3c);
        color: white;
        padding: 12px 16px;
        text-align: center;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease;
        font-family: var(--app-font-family, -apple-system, sans-serif);
    `;
    offlineBanner.textContent = `⚠️ ${message}`;
    document.body.prepend(offlineBanner);

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

async function initApp() {
    console.log('🔧 Начало инициализации приложения...');
    
    const tg = window.Telegram?.WebApp;

    // Настройка Telegram
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

    // Insets
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

    // Пользователь
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

    // Загрузка данных
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

    // Авторизация
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

            if (result.syncEnabled) {
                console.log('🔄 Синхронизация включена (PRO)');

                if (window.deviceService) {
                    await window.deviceService.register();
                }

                if (window.initExportButtons) {
                    window.initExportButtons();
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

    // Push-уведомления
    if (tg) {
        tg.onEvent('message', async (message) => {
            console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);

            if (message.text === '🔄' && window.userStore?.canSync()) {
                console.log('✅ СИГНАЛ ОБНОВЛЕНИЯ РАСПОЗНАН!');

                if (window.uiRenderer) {
                    window.uiRenderer.showSyncStatus('syncing');
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

    // Восстановление последнего чата
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

    // Периодическая очистка
    setInterval(() => {
        if (window.chatUI) {
            window.chatUI.cleanupTempChats();
        }
        if (window.updateTrashCount) {
            window.updateTrashCount();
        }
    }, 5 * 60 * 1000);

    // Офлайн/онлайн обработчики
    window.addEventListener('online', () => {
        console.log('🌐 Интернет восстановлен');
        hideOfflineBanner();

        if (window.chatUI) {
            window.chatUI.refreshUI();
        }
    });

    window.addEventListener('offline', () => {
        console.log('📴 Интернет потерян');
        showOfflineBanner();
    });

    // Кнопка "Новый чат"
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

    // Финальная отрисовка
    const appScreen = document.getElementById('app-screen');
    if (appScreen) {
        appScreen.classList.remove('hidden');
        if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
    }

    if (window.updateTrashCount) {
        setTimeout(window.updateTrashCount, 1000);
    }

    // Проверяем интернет при старте
    if (!navigator.onLine) {
        showOfflineBanner();
    }

    console.log('✅ Приложение v3.0 успешно загружено');
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('❌ Критический сбой инициализации:', err);
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                    <h2 style="color:var(--app-accent-danger);font-size:24px;margin-bottom:16px;">⚠️ Ошибка загрузки</h2>
                    <p style="color:var(--app-text-secondary);font-size:16px;margin-bottom:24px;">${err.message || 'Неизвестная ошибка'}</p>
                    <button onclick="location.reload()" class="btn" style="padding:12px 32px;border-radius:12px;font-size:16px;">
                        🔄 Перезагрузить
                    </button>
                </div>
            `;
            appScreen.style.display = 'flex';
        }
    });
});

// Если DOM уже загружен
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (document.getElementById('app-screen')) {
            initApp().catch(err => {
                console.error('❌ Критический сбой инициализации:', err);
            });
        }
    }, 100);
}

// Запрос fullscreen
if (window.Telegram?.WebApp?.requestFullscreen) {
    try {
        window.Telegram.WebApp.requestFullscreen();
    } catch (e) {}
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ LUCIDE ПОСЛЕ ЗАГРУЗКИ ВСЕГО
// ==========================================

function initLucideIcons() {
    if (typeof lucide !== 'undefined') {
        try {
            lucide.createIcons();
            console.log('✅ Lucide иконки созданы');
            return true;
        } catch (e) {
            console.warn('⚠️ Ошибка создания иконок:', e);
            return false;
        }
    }
    console.warn('⚠️ Lucide не найден');
    return false;
}

// Пробуем создать иконки с задержкой
setTimeout(function() {
    initLucideIcons();
}, 300);

// Также пробуем после полной загрузки страницы
window.addEventListener('load', function() {
    initLucideIcons();
});

// И через 1 секунду для верности
setTimeout(function() {
    initLucideIcons();
}, 1000);

console.log('✅ app.js v3.0 полностью загружен');
