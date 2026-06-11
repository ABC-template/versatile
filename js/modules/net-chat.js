// js /modules /net-chat.js

// 1. Проверка подписки в Telegram-канале через бэкенд Edge API
window.checkSubscriptionAndLoad = async function(uid) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.warn("Нет initData, работа в офлайн-режиме");
        window.config.dailyLimit = 9999;
        window.config.role = 'creator';
        window.showChat();
        if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
        if (typeof window.selectTopic === 'function') window.selectTopic(window.currentTopic);
        return;
    }
    try {
        const response = await fetch(`/api/check-sub`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        let data = {};
        try {
            data = await response.json();
        } catch (jsonErr) {
            console.warn("Сервер вернул не JSON:", jsonErr);
            data = { isMember: true, role: 'creator', dailyLimit: 9999, syncEnabled: true };
        }
        if (data.error) {
            console.error("Ошибка проверки подписки:", data.error);
            window.showGuest({ msg: "500", joke: "Сбой синхронизации с сервером" });
            return;
        }
        window.config.dailyLimit = data.dailyLimit || 9999;
        window.config.role = data.role || 'creator';
        window.config.syncEnabled = data.syncEnabled === true;
        if (data.isMember || data.role === 'admin' || data.role === 'creator') {
            window.showChat();
            if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
            if (typeof window.selectTopic === 'function') window.selectTopic(window.currentTopic);
            // Если синхронизация включена, загружаем метаданные чатов
            if (window.config.syncEnabled && typeof window.syncChatsMetadata === 'function') {
                await window.syncChatsMetadata();
            }
        } else {
            window.showGuest({ msg: "403", joke: "Для доступа к ИИ необходимо подписаться на канал!" });
        }
    } catch (err) {
        console.error("Глобальная ошибка сети, включаем Creator-допуск:", err);
        window.config.dailyLimit = 9999;
        window.config.role = 'creator';
        window.config.syncEnabled = false;
        window.showChat();
        if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
        if (typeof window.selectTopic === 'function') window.selectTopic(window.currentTopic);
    }
};

// 2. Инкремент суточного счетчика использования лимита с записью в CloudStorage
window.incrementUsage = function() {
    window.usedToday++;
    const today = new Date().toLocaleDateString();
    const data = JSON.stringify({ date: today, count: window.usedToday });
    
    if (window.tg && window.tg.CloudStorage) {
        window.tg.CloudStorage.setItem('usage_data', data);
    } else {
        localStorage.setItem('usage_data', data);
    }
    if (typeof window.updateLimitDisplay === 'function') window.updateLimitDisplay();
};

// 3. Главная асинхронная функция отправки сообщений ИИ (с анти-спам блокировкой)
window.sendMessage = async function() {
    if (window.isVoiceRecording) {
        window.isExpressVoiceTarget = true; 
        const voiceBtn = document.querySelector('.voice-btn');
        if (typeof window.toggleVoiceRecording === 'function' && voiceBtn) {
            await window.toggleVoiceRecording(voiceBtn); 
        }
        return;
    }
    
    if (window.isSendingMessage) return; 

    const input = document.getElementById('user-input');
    if (!input) return;
    let text = input.value.trim();
    if (!text) return;

    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && window.usedToday >= window.config.dailyLimit) {
        if (window.tg && window.tg.showAlert) window.tg.showAlert("Ежедневный лимит запросов исчерпан!");
        return;
    }

    window.isSendingMessage = true;
    input.disabled = true;
    
    const voiceBtn = document.querySelector('.voice-btn');
    if (voiceBtn) voiceBtn.disabled = true;

    // Считываем прикрепленное изображение (если оно есть)
    const mediaToAttach = window.currentAttachedImageBase64 || null;
    if (mediaToAttach) {
        text = `📸 [Прикреплено изображение]\n${text}`;
    }
    if (typeof window.addMessageToStorage === 'function') window.addMessageToStorage(text, 'user-msg');
    
    input.value = '';
    input.style.height = 'auto'; 
    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) clearBtn.classList.add('hidden');

    if (typeof window.collapseInputArea === 'function') window.collapseInputArea();
    if (document.activeElement === input) input.blur(); 

    if (typeof window.showSkeleton === 'function') window.showSkeleton();

    const activeChat = window.getCurrentActiveChat();
    const maxContextLimit = activeChat ? (activeChat.maxContext || 15) : 15;
    const contextMessages = activeChat ? activeChat.messages.slice(-maxContextLimit) : [];
    
    const cleanHistoryMessages = contextMessages.map(msg => ({ type: String(msg.type), text: String(msg.text) }));

    try {
        if (typeof window.streamAiResponse === 'function') {
            const userLang = activeChat?.language || window.tg?.initDataUnsafe?.user?.language_code || 'ru';
            
            // Передаем прикрепленное изображение четвертым параметром в функцию стриминга
            await window.streamAiResponse(cleanHistoryMessages, window.currentTopic, userLang, mediaToAttach, activeChat);
        }
    } catch (error) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой отправки:", error);
        if (typeof window.renderMessageToDOM === 'function') {
            window.renderMessageToDOM(`Сбой связи с приложением: ${error.message}`, 'ai-msg');
        }
    } finally {
        // ОБЯЗАТЕЛЬНО: Очищаем черновик и превью картинки после попытки отправки
        if (typeof window.clearImageAttachment === 'function') {
            window.clearImageAttachment();
        }
        
        window.isSendingMessage = false;
        input.disabled = false;
        if (voiceBtn) voiceBtn.disabled = false;
    }
};

// ВСПОМОГАТЕЛЬНЫЙ ТУЛТИП ДЛЯ ИКОНОК
function triggerTooltip(btn) {
    btn.classList.add('show-tip');
    setTimeout(() => { btn.classList.remove('show-tip'); }, 1200);
}

// 4. ФУНКЦИЯ КОПИРОВАНИЯ ТЕКСТА ОТВЕТА AI
window.copyMsgText = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(tId => {
        (window.chatHistories[tId] || []).forEach(chat => {
            const msg = (chat.messages || []).find(m => m.id === msgId);
            if (msg) foundMsg = msg;
        });
    });
    if (!foundMsg) return;

    navigator.clipboard.writeText(foundMsg.text).then(() => {
        triggerTooltip(btn);
    }).catch(() => {
        if (window.tg && window.tg.showAlert) window.tg.showAlert('Ошибка копирования');
    });
};

// 5. ФУНКЦИЯ ГЕНЕРАЦИИ ССЫЛКИ ШЕРИНГА В ТЕЛЕГРАМ
window.shareMsgText = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(tId => {
        (window.chatHistories[tId] || []).forEach(chat => {
            const msg = (chat.messages || []).find(m => m.id === msgId);
            if (msg) foundMsg = msg;
        });
    });
    if (!foundMsg) return;

    // Ссылка оформлена с пробелами перед косой чертой
    const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(foundMsg.text)}`;
    
    triggerTooltip(btn);
    
    setTimeout(() => {
        if (window.tg && window.tg.openTelegramLink) window.tg.openTelegramLink(shareUrl);
        else window.open(shareUrl, '_blank');
    }, 300);
};

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
