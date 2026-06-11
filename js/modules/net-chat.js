// js/modules/net-chat.js

// ... (весь существующий код остается, добавляем только функцию toggleFavoriteMsg)

// 6. ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ИЗБРАННОГО (с синхронизацией)
window.toggleFavoriteMsg = async function(btn, msgId) {
    let foundMsg = null;
    let foundChat = null;
    let foundTopic = null;
    
    // Находим сообщение и чат, которому оно принадлежит
    for (const [topicId, chats] of Object.entries(window.chatHistories)) {
        for (const chat of chats) {
            const msg = (chat.messages || []).find(m => m.id === msgId);
            if (msg) {
                foundMsg = msg;
                foundChat = chat;
                foundTopic = topicId;
                break;
            }
        }
        if (foundMsg) break;
    }
    
    if (!foundMsg) return;

    // Переключаем статус избранного
    foundMsg.isFavorite = !foundMsg.isFavorite;
    const heartSpan = btn.querySelector('.icon-heart');

    if (foundMsg.isFavorite) {
        btn.classList.add('is-favorite');
        if (heartSpan) heartSpan.innerText = '❤️';
        btn.setAttribute('data-tooltip', '❤️');
    } else {
        btn.classList.remove('is-favorite');
        if (heartSpan) heartSpan.innerText = '🤍';
        btn.setAttribute('data-tooltip', '🤍');
    }

    triggerTooltip(btn);
    window.saveHistoriesToLocal();
    
    // СИНХРОНИЗАЦИЯ С ОБЛАКОМ (если включена)
    if (window.config.syncEnabled && foundChat && foundChat.id) {
        const initData = window.Telegram?.WebApp?.initData;
        if (initData) {
            try {
                const response = await fetch('/api/chats/action', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initData
                    },
                    body: JSON.stringify({
                        action: 'favorite_message',
                        chatId: foundChat.id,
                        messageId: msgId,
                        isFavorite: foundMsg.isFavorite
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error("Ошибка синхронизации избранного:", errorData.error);
                } else {
                    console.log(`Избранное синхронизировано: ${msgId} = ${foundMsg.isFavorite}`);
                }
            } catch (err) {
                console.error("Сбой сети при синхронизации избранного:", err);
                // Помечаем для повторной синхронизации позже
                if (!window.unsyncedFavorites) window.unsyncedFavorites = [];
                window.unsyncedFavorites.push({
                    messageId: msgId,
                    chatId: foundChat.id,
                    isFavorite: foundMsg.isFavorite,
                    timestamp: new Date().toISOString()
                });
                window.saveHistoriesToLocal();
            }
        }
    }
};

// Вспомогательная функция для повторной синхронизации избранного
window.retryUnsyncedFavorites = async function() {
    if (!window.config.syncEnabled) return;
    if (!window.unsyncedFavorites || window.unsyncedFavorites.length === 0) return;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    
    const failedAgain = [];
    
    for (const item of window.unsyncedFavorites) {
        try {
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({
                    action: 'favorite_message',
                    chatId: item.chatId,
                    messageId: item.messageId,
                    isFavorite: item.isFavorite
                })
            });
            
            if (!response.ok) {
                failedAgain.push(item);
            }
        } catch (err) {
            console.error("Ошибка повторной синхронизации избранного:", err);
            failedAgain.push(item);
        }
    }
    
    window.unsyncedFavorites = failedAgain;
    window.saveHistoriesToLocal();
};

// Добавляем в существующий retry-таймер также проверку избранного
// В net-sync.js в функцию startUnsyncedRetryTimer добавить:
// if (typeof window.retryUnsyncedFavorites === 'function') {
//     await window.retryUnsyncedFavorites();
// }
