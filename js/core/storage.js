// js /core /storage.js
// Генерация UUID для совместимости со всеми браузерами (включая WebView Telegram)
window.generateUUID = function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // fallback для очень старых окружений (почти не понадобится)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

window.loadLocalHistories = function() {
    try { window.chatHistories = JSON.parse(localStorage.getItem('tg_chat_histories') || '{}'); } catch(e) { window.chatHistories = {}; }
    try { window.activeChatIds = JSON.parse(localStorage.getItem('active_chat_ids') || '{}'); } catch(e) { window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null }; }
};

window.saveHistoriesToLocal = function() {
    try {
        localStorage.setItem('tg_chat_histories', JSON.stringify(window.chatHistories));
        localStorage.setItem('active_chat_ids', JSON.stringify(window.activeChatIds));
    } catch (e) { console.error("Превышен лимит localStorage:", e); }
};

window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

window.createNewChat = async function() {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    const newId = window.generateUUID();                 // вместо "chat_" + Date.now()
    const currentList = window.chatHistories[window.currentTopic];
    const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
    const sysLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
    const startTitle = `${window.getLangString('start_chat')} "${sectionName}"`;
    const welcomeText = window.welcomeTexts[window.currentTopic] || `Привет!`;
    const firstMsgId = window.generateUUID();            // вместо "msg_" + Date.now() + "_" + random
    const newChat = {
        id: newId,
        title: startTitle,
        maxContext: 15,
        language: sysLang,
        topic: window.currentTopic,
        userRenamed: false,
        messages: [{
            id: firstMsgId,
            text: welcomeText,
            type: "ai-msg",
            isFavorite: false
        }]
    };
    currentList.unshift(newChat);
    window.activeChatIds[window.currentTopic] = newId;
    window.saveHistoriesToLocal();
    window.refreshUiAfterChatSelection();
    const card = document.getElementById('profile-card');
    if (card) {
        card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
    }
    if (window.config.syncEnabled) {
        const initData = window.Telegram?.WebApp?.initData;
        if (initData) {
            try {
                await fetch('/api/chats/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                    body: JSON.stringify({
                        action: 'new_chat',
                        chat: {
                            id: newChat.id,
                            topic_id: newChat.topic,
                            title: newChat.title,
                            max_context: newChat.maxContext,
                            user_renamed: newChat.userRenamed
                        },
                        firstMessage: {
                            id: firstMsgId,
                            text: welcomeText,
                            type: 'ai-msg',
                            is_favorite: false
                        }
                    })
                });
            } catch (err) { console.error("Ошибка синхронизации нового чата:", err); }
        }
    }
};

window.switchActiveChat = async function(chatId) {
    window.activeChatIds[window.currentTopic] = chatId;
    window.saveHistoriesToLocal();
    if (window.config && window.config.syncEnabled && typeof window.loadFullChat === 'function') {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
            await window.loadFullChat(chatId);
        }
    }
    window.refreshUiAfterChatSelection();
};

window.refreshUiAfterChatSelection = function() {
    window.applyUiLocalization(); // Перерисовываем интерфейс под язык активного чата
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    if (typeof window.loadActiveChatMessages === 'function') window.loadActiveChatMessages();
    if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
};

window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    
    const action = () => {
        let modelsChats = window.chatHistories[window.currentTopic] || [];
        window.chatHistories[window.currentTopic] = modelsChats.filter(c => c.id !== chatId);

        if (window.activeChatIds[window.currentTopic] === chatId) {
            const remainingChats = window.chatHistories[window.currentTopic];
            window.activeChatIds[window.currentTopic] = remainingChats[0]?.id || null;
        }

        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_chat'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_chat'))) {
        action();
    }
};

// Функция переименования чата (Книга со своим названием)
window.renameChat = async function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation();
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const chat = modelsChats.find(c => c.id === chatId);
    if (!chat) return;
    const newTitle = prompt(window.getLangString('prompt_rename'), chat.title);
    if (newTitle && newTitle.trim().length > 0) {
        chat.title = newTitle.trim();
        chat.userRenamed = true;
        window.saveHistoriesToLocal();
        if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        // Отправляем на сервер
        if (window.config.syncEnabled && chat.id) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                try {
                    await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                        body: JSON.stringify({
                            action: 'rename_chat',
                            chatId: chat.id,
                            newTitle: chat.title
                        })
                    });
                } catch (err) { console.error("Ошибка переименования на сервере:", err); }
            }
        }
    }
};

// Функция удаления отдельной реплики внутри чата (Чистка книги знаний)
window.deleteMessage = async function(msgId) {
    const action = async () => {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat) return;
        activeChat.messages = activeChat.messages.filter(m => m.id !== msgId);
        window.saveHistoriesToLocal();
        const domBlock = document.getElementById(`msg-block-${msgId}`);
        if (domBlock) {
            domBlock.style.transition = 'all 0.25s ease';
            domBlock.style.opacity = '0';
            domBlock.style.transform = 'scale(0.95)';
            setTimeout(() => { domBlock.remove(); }, 250);
        }
        // Отправляем на сервер, если синхронизация включена
        if (window.config.syncEnabled && activeChat.id) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                try {
                    await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                        body: JSON.stringify({
                            action: 'delete_message',
                            chatId: activeChat.id,
                            messageId: msgId
                        })
                    });
                } catch (err) { console.error("Ошибка удаления на сервере:", err); }
            }
        }
    };
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_msg'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_msg'))) {
        action();
    }
};

windowwindow.addMessageToStorage = async function(text, className) {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    const activeChat = window.getCurrentActiveChat();
    const generatedMsgId = window.generateUUID();      // замена
    if (activeChat) {
        const newMsg = {
            id: generatedMsgId,
            text: text,
            type: className,
            isFavorite: false
        };
        activeChat.messages.push(newMsg);
        const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
        const startTitle = `${window.getLangString('start_chat')} "${sectionName}"`;
        if (className === 'user-msg' && (!activeChat.userRenamed || activeChat.title === startTitle)) {
            activeChat.title = text.substring(0, 18) + (text.length > 18 ? '...' : '');
        }
        window.saveHistoriesToLocal();
        if (typeof window.renderMessageToDOM === 'function') window.renderMessageToDOM(text, className, generatedMsgId);
        if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        if (window.config.syncEnabled && activeChat.id) {
            try {
                const initData = window.Telegram?.WebApp?.initData;
                if (initData) {
                    await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Telegram-Init-Data': initData
                        },
                        body: JSON.stringify({
                            action: 'new_message',
                            chatId: activeChat.id,
                            message: {
                                id: generatedMsgId,
                                text: text,
                                type: className,
                                isFavorite: false
                            }
                        })
                    });
                }
            } catch (err) {
                console.error("Ошибка отправки сообщения на сервер:", err);
            }
        }
    }
};
