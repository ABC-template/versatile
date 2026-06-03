// 1. Проверка подписки в Telegram-канале через бэкенд Edge API
window.checkSubscriptionAndLoad = async function(uid) {
    try {
        const hasKey = !!(window.allUserKeys[window.currentModel] && window.allUserKeys[window.currentModel].trim().length > 0);
        const response = await fetch(`/api/check-sub?userId=${uid}&hasOwnKey=${hasKey}`);
        const data = await response.json();

        if (data.error) {
            console.error("Сервер проверки подписки вернул ошибку:", data.error);
            window.showGuest({ msg: "500", joke: "Сбой синхронизации с сервером" });
            return;
        }

        window.config.dailyLimit = data.dailyLimit;
        window.config.role = data.role;
        window.config.serverModels = data.serverModels;

        if (data.isMember || data.role === 'admin') {
            window.showChat();
            if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
            if (typeof window.selectModel === 'function') window.selectModel(window.currentModel);
        } else {
            window.showGuest({ msg: "403", joke: "Для доступа к ИИ необходимо подписаться на канал!" });
        }
    } catch (err) {
        console.error("Ошибка сети при проверке подписки:", err);
        window.showGuest({ msg: "Сбой сети", joke: "Проверьте интернет-соединение" });
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

// 3. Сохранение введенного пользователем API-ключ в CloudStorage Telegram
window.saveCurrentKey = function() {
    const input = document.getElementById('profile-api-key-input');
    if (!input) return;
    const keyValue = input.value.trim();

    if (keyValue) window.allUserKeys[window.currentModel] = keyValue;
    else delete window.allUserKeys[window.currentModel];

    const onSaveDone = () => {
        if (window.tg && window.tg.showAlert) window.tg.showAlert(`API-ключ для ${window.modelNames[window.currentModel]} привязан!`);
        if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
        if (typeof window.selectModel === 'function') window.selectModel(window.currentModel);
    };

    if (window.tg && window.tg.CloudStorage) {
        window.tg.CloudStorage.setItem('ai_user_keys', JSON.stringify(window.allUserKeys), onSaveDone);
    } else {
        localStorage.setItem('ai_user_keys', JSON.stringify(window.allUserKeys));
        onSaveDone();
    }
};

// 4. Главная асинхронная функция отправки сообщений ИИ (с анти-спам блокировкой)
window.sendMessage = async function() {
    if (window.isVoiceRecording) {
        window.isExpressVoiceTarget = true; // Выставляем флаг экспресс-доставки
        const voiceBtn = document.querySelector('.voice-btn');
        if (typeof window.toggleVoiceRecording === 'function' && voiceBtn) {
            await window.toggleVoiceRecording(voiceBtn); // Принудительно гасим микрофон
        }
        return;
    }
    
    if (window.isSendingMessage) return; 

    const input = document.getElementById('user-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && window.usedToday >= window.config.dailyLimit) {
        if (window.tg && window.tg.showAlert) window.tg.showAlert("Ежедневный лимит бесплатных запросов исчерпан!");
        return;
    }

    // НАЧАЛО БЛОКА ЗАМОРОЗКИ ИНТЕРФЕЙСА
    window.isSendingMessage = true;
    input.disabled = true;
    
    // Блокируем кнопку диктофона во время отправки текста
    const voiceBtn = document.querySelector('.voice-btn');
    if (voiceBtn) voiceBtn.disabled = true;

    if (typeof window.addMessageToStorage === 'function') window.addMessageToStorage(text, 'user-msg');
    
    input.value = '';
    input.style.height = 'auto'; 
    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) clearBtn.classList.add('hidden');

    if (typeof window.collapseInputArea === 'function') window.collapseInputArea();
    if (document.activeElement === input) input.blur(); 

    if (typeof window.showSkeleton === 'function') window.showSkeleton();

    const modelsChats = window.chatHistories[window.currentModel] || [];
    const currentActiveId = window.activeChatIds[window.currentModel];
    const activeChat = modelsChats.find(c => c.id === currentActiveId);
    const maxContextLimit = activeChat ? (activeChat.maxContext || 15) : 15;
    const contextMessages = activeChat ? activeChat.messages.slice(-maxContextLimit) : [];
    
    const cleanHistoryMessages = contextMessages.map(msg => ({ type: String(msg.type), text: String(msg.text) }));

    try {
        if (typeof window.streamAiResponse === 'function') {
            await window.streamAiResponse(cleanHistoryMessages, window.allUserKeys[window.currentModel], activeChat);
        }
    } catch (error) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой отправки:", error);
        if (typeof window.renderMessageToDOM === 'function') {
            window.renderMessageToDOM(`Сбой связи с приложением: ${error.message}`, 'ai-msg');
        }
    } finally {
        // НАЧАЛО БЛОКА РАЗМОРОЗКИ ИНТЕРФЕЙСА
        window.isSendingMessage = false;
        input.disabled = false;
        
        // Разблокируем диктофон обратно, когда ИИ закончил писать
        if (voiceBtn) voiceBtn.disabled = false;
    }
};

// ВСПОМОГАТЕЛЬНЫЙ ТУЛТИП ДЛЯ ИКОНОК
function triggerTooltip(btn) {
    btn.classList.add('show-tip');
    setTimeout(() => { btn.classList.remove('show-tip'); }, 1200);
}

// 1. ФУНКЦИЯ КОПИРОВАНИЯ ТЕКСТА ОТВЕТА AI
window.copyMsgText = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(mId => {
        (window.chatHistories[mId] || []).forEach(chat => {
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

// 2. ФУНКЦИЯ НАВЕДЕНИЯ ССЫЛКИ И НАВЕДЕНИЯ ШЕРИНГА В ТЕЛЕГРАМ
window.shareMsgText = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(mId => {
        (window.chatHistories[mId] || []).forEach(chat => {
            const msg = (chat.messages || []).find(m => m.id === msgId);
            if (msg) foundMsg = msg;
        });
    });
    if (!foundMsg) return;

    const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(foundMsg.text)}`;
    
    triggerTooltip(btn);
    
    setTimeout(() => {
        if (window.tg && window.tg.openTelegramLink) window.tg.openTelegramLink(shareUrl);
        else window.open(shareUrl, '_blank');
    }, 300);
};

// 3. ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ИЗБРАННОГО С ЖЕСТКИМ СОХРАНЕНИЕМ В LOCALSTORAGE
window.toggleFavoriteMsg = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(mId => {
        (window.chatHistories[mId] || []).forEach(chat => {
            const msg = (chat.messages || []).find(m => m.id === msgId);
            if (msg) foundMsg = msg;
        });
    });
    if (!foundMsg) return;

    foundMsg.isFavorite = !foundMsg.isFavorite;
    const heartSpan = btn.querySelector('.icon-heart');

    if (foundMsg.isFavorite) {
        btn.classList.add('is-favorite');
        if (heartSpan) heartSpan.innerText = '❤️';
        btn.setAttribute('data-tooltip', 'В избранном!');
    } else {
        btn.classList.remove('is-favorite');
        if (heartSpan) heartSpan.innerText = '🤍';
        btn.setAttribute('data-tooltip', 'Удалено!');
    }

    triggerTooltip(btn);
    window.saveHistoriesToLocal();
};

