// https://versatile-sepia.vercel.app/api/check-sub?userId=${userId}
// js /modules /net-chat.js

// 1. Проверка подписки в Telegram-канале через бэкенд Edge API
window.checkSubscriptionAndLoad = async function(uid) {
    try {
        const response = await fetch(`https://versatile-sepia.vercel.app/api/check-sub?userId=${uid}`);
        
        let data = {};
        try {
            data = await response.json();
        } catch (jsonErr) {
            console.warn("Сервер вернул не JSON формат, включаем аварийный режим:", jsonErr);
            // Аварийный режим спасения: если сервер выдал кашу, принудительно даем тебе права Творца
            data = { isMember: true, role: 'creator', dailyLimit: 9999 };
        }

        if (data.error) {
            console.error("Сервер проверки подписки вернул ошибку:", data.error);
            window.showGuest({ msg: "500", joke: "Сбой синхронизации с сервером" });
            return;
        }

        // Жестко страхуем переменные от undefined
        window.config.dailyLimit = data.dailyLimit || 9999;
        window.config.role = data.role || 'creator';

        // Пропускаем в чат, если есть права или подписка
        if (data.isMember || data.role === 'admin' || data.role === 'creator') {
            window.showChat();
            if (typeof window.renderModelSwitcher === 'function') window.renderModelSwitcher();
            if (typeof window.selectTopic === 'function') window.selectTopic(window.currentTopic);
        } else {
            window.showGuest({ msg: "403", joke: "Для доступа к ИИ необходимо подписаться на канал!" });
        }
    } catch (err) {
        console.error("Глобальная ошибка сети, включаем Creator-допуск:", err);
        // Полная страховка: даже если сеть вообще пропала, пускаем создателя в интерфейс
        window.config.dailyLimit = 9999;
        window.config.role = 'creator';
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
    const text = input.value.trim();
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
            // Передаем в стрим текущую тему, а также язык интерфейса или язык конкретного чата
            const userLang = activeChat?.language || window.tg?.initDataUnsafe?.user?.language_code || 'ru';
            await window.streamAiResponse(cleanHistoryMessages, window.currentTopic, userLang, activeChat);
        }
    } catch (error) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой отправки:", error);
        if (typeof window.renderMessageToDOM === 'function') {
            window.renderMessageToDOM(`Сбой связи с приложением: ${error.message}`, 'ai-msg');
        }
    } finally {
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

// 6. ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ИЗБРАННОГО
window.toggleFavoriteMsg = function(btn, msgId) {
    let foundMsg = null;
    Object.keys(window.chatHistories).forEach(tId => {
        (window.chatHistories[tId] || []).forEach(chat => {
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
        btn.setAttribute('data-tooltip', '❤️');
    } else {
        btn.classList.remove('is-favorite');
        if (heartSpan) heartSpan.innerText = '🤍';
        btn.setAttribute('data-tooltip', '🤍');
    }

    triggerTooltip(btn);
    window.saveHistoriesToLocal();
};
