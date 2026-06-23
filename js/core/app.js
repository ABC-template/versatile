// ============================================
// js/core/app.js
// Описание: Инициализация приложения
// Версия: 3.0.0 (с интеграцией тем и иконок)
// ============================================

console.log('🚀 App v3.0 начал загрузку');

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОФЛАЙН-РЕЖИМА
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

function checkOnline() {
    if (!navigator.onLine) {
        showOfflineBanner();
        return false;
    }
    hideOfflineBanner();
    return true;
}

// ==========================================
// ОСНОВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
// ==========================================

async function initApp() {
    console.log('🔧 Начало инициализации приложения...');
    
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
            console.log('✅ Telegram WebApp инициализирован');
        } catch (e) {
            console.error('Ошибка активации Telegram SDK:', e);
        }
    }

    // ==========================================
    // 2. НАСТРОЙКА INSETS (БЕЗОПАСНЫЕ ЗОНЫ)
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
    // 3. ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ
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
        
        console.log(`👤 Пользователь: ${user.first_name} (${user.id})`);
    }

    // ==========================================
    // 4. ЗАГРУЗКА ДАННЫХ ИЗ ХРАНИЛИЩА
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
    // 5. АВТОРИЗАЦИЯ
    // ==========================================
    
    const uid = user?.id;
    if (!uid) {
        console.warn('⚠️ User ID не найден, работа в гостевом режиме');
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
        try {
            const result = await window.authService.checkSubscription();
            console.log(`📊 Результат проверки подписки:`, result);

            if (result.isMember || result.role === 'admin' || result.role === 'creator') {
                console.log(`👤 Пользователь авторизован: ${result.role}`);

                if (window.chatUI) {
                    window.chatUI.showChatInterface();
                }

                // Регистрация устройства (только для PRO)
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
                console.warn('⚠️ Пользователь не имеет доступа');
                if (window.showGuest) {
                    window.showGuest({
                        msg: '403',
                        joke: 'Для доступа к ИИ необходимо подписаться на канал!'
                    });
                }
            }
        } catch (err) {
            console.error('❌ Ошибка проверки подписки:', err);
            // Продолжаем работу в офлайн-режиме
            if (window.chatUI) {
                window.chatUI.showChatInterface();
            }
        }
    } else {
        console.warn('⚠️ AuthService не найден, работа в офлайн-режиме');
        if (window.chatUI) {
            window.chatUI.showChatInterface();
        }
    }

    // ==========================================
    // 6. PUSH-УВЕДОМЛЕНИЯ
    // ==========================================
    
    if (tg) {
        try {
            tg.onEvent('message', async (message) => {
                console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);

                if (message.text === '🔄' && window.userStore?.canSync()) {
                    console.log('✅ СИГНАЛ ОБНОВЛЕНИЯ РАСПОЗНАН!');

                    if (window.uiRenderer) {
                        window.uiRenderer.showSyncStatus('syncing');
                    }

                    // Обновляем UI
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
        } catch (e) {
            console.warn('⚠️ Ошибка активации push-подписки:', e);
        }
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
    // 9. ОФЛАЙН/ОНЛАЙН ОБРАБОТЧИКИ
    // ==========================================
    
    window.addEventListener('online', () => {
        console.log('🌐 Интернет восстановлен');
        hideOfflineBanner();

        if (window.chatUI) {
            window.chatUI.refreshUI();
        }
        
        // Обновляем иконки при восстановлении сети
        initLucideIcons();
    });

    window.addEventListener('offline', () => {
        console.log('📴 Интернет потерян');
        showOfflineBanner();
    });

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

    if (window.updateTrashCount) {
        setTimeout(window.updateTrashCount, 1000);
    }

    // Проверяем интернет при старте
    if (!navigator.onLine) {
        showOfflineBanner();
    }

    console.log('✅ Приложение v3.0 успешно загружено');
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ LUCIDE ИКОНОК
// ==========================================

function initLucideIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try {
            lucide.createIcons();
            console.log('✅ Lucide иконки созданы');
            return true;
        } catch (e) {
            console.warn('⚠️ Ошибка создания иконок Lucide:', e);
            return false;
        }
    }
    return false;
}

// ==========================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================

// Старт после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Сначала инициализируем иконки
    initLucideIcons();
    
    // Затем запускаем приложение
    initApp().catch(err => {
        console.error('❌ Критический сбой инициализации:', err);
        // Показываем сообщение об ошибке
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
    // Небольшая задержка, чтобы все скрипты успели загрузиться
    setTimeout(() => {
        if (document.getElementById('app-screen')) {
            initLucideIcons();
            initApp().catch(err => {
                console.error('❌ Критический сбой инициализации:', err);
            });
        }
    }, 100);
}

// ==========================================
// ПОВТОРНАЯ ИНИЦИАЛИЗАЦИЯ ИКОНОК
// ==========================================

// Пытаемся еще раз через 500ms (на случай, если Lucide загрузился позже)
setTimeout(function() {
    if (!initLucideIcons()) {
        // Если не получилось - пробуем еще через 500ms
        setTimeout(function() {
            initLucideIcons();
        }, 500);
    }
}, 500);

// Еще одна попытка после полной загрузки страницы
window.addEventListener('load', function() {
    initLucideIcons();
});

// ==========================================
// НАБЛЮДАТЕЛЬ ЗА ИЗМЕНЕНИЯМИ DOM
// ==========================================

// Автоматически обновляем иконки при добавлении новых элементов с data-lucide
if (window.MutationObserver && typeof lucide !== 'undefined') {
    const observer = new MutationObserver(function(mutations) {
        let needsUpdate = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.querySelector && node.querySelector('[data-lucide]')) {
                            needsUpdate = true;
                            break;
                        }
                        if (node.hasAttribute && node.hasAttribute('data-lucide')) {
                            needsUpdate = true;
                            break;
                        }
                    }
                }
            }
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-lucide') {
                needsUpdate = true;
                break;
            }
        }
        
        if (needsUpdate) {
            try {
                lucide.createIcons();
            } catch (e) {
                // Игнорируем
            }
        }
    });
    
    // Запускаем наблюдатель после загрузки DOM
    document.addEventListener('DOMContentLoaded', function() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-lucide']
        });
        console.log('✅ MutationObserver для Lucide иконок активирован');
    });
}

// ==========================================
// ЗАПРОС FULLSCREEN (если поддерживается)
// ==========================================

if (window.Telegram?.WebApp?.requestFullscreen) {
    try {
        window.Telegram.WebApp.requestFullscreen();
    } catch (e) {
        // Игнорируем
    }
}

// ==========================================
// ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК
// ==========================================

window.addEventListener('error', function(event) {
    console.error('❌ Глобальная ошибка:', event.message, event.filename, event.lineno);
    
    // Игнорируем ошибки Lucide, они не критичны
    if (event.message && event.message.includes('lucide')) {
        return;
    }
});

console.log('✅ app.js v3.0 полностью загружен');
