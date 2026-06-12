// js /core /storage.js

// Глобальный генератор валидных UUID для Supabase (доступен для всех файлов)
window.generateUUID = function() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

window.loadLocalHistories = function() {
    try { window.chatHistories = JSON.parse(localStorage.getItem('tg_chat_histories') || '{}'); } catch(e) { window.chatHistories = {}; }
    try { window.activeChatIds = JSON.parse(localStorage.getItem('active_chat_ids') || '{}'); } catch(e) { window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null }; }
    
    // Восстанавливаем unsyncedMessages из localStorage
    try { window.unsyncedMessages = JSON.parse(localStorage.getItem('unsynced_messages') || '[]'); } catch(e) { window.unsyncedMessages = []; }
};

window.saveHistoriesToLocal = function() {
    try {
        localStorage.setItem('tg_chat_histories', JSON.stringify(window.chatHistories));
        localStorage.setItem('active_chat_ids', JSON.stringify(window.activeChatIds));
        localStorage.setItem('unsynced_messages', JSON.stringify(window.unsyncedMessages));
    } catch (e) { console.error("Превышен лимит localStorage:", e); }
};

window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

// Вместо существующей window.createNewChat
// Найти функцию createNewChat и заменить на:

window.createNewChat = async function() {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    
    const newId = window.generateUUID();
    const currentList = window.chatHistories[window.currentTopic];
    const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const startTitle = `Новый чат в "${sectionName}" (${dateStr} ${timeStr})`;
    
    const sysLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
    const welcomeText = window.welcomeTexts[window.currentTopic] || `Привет! Я Versatile AI в режиме "${sectionName}". Чем могу помочь?`;
    
    const newChat = {
        id: newId,
        title: startTitle,
        maxContext: 15,
        language: sysLang,
        topic: window.currentTopic,
        userRenamed: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        messages: [{
            id: window.generateUUID(),
            text: welcomeText,
            type: "ai-msg",
            isFavorite: false,
            synced: false,
            created_at: now.toISOString()
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
    
    // Синхронизация с облаком
    if (window.config.syncEnabled) {
        await window.syncNewChatToCloud(newChat);
    }
};

// Обновить syncNewChatToCloud
window.syncNewChatToCloud = async function(chat) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    
    try {
        const response = await fetch('/api/chats/action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData,
                'X-Device-Fingerprint': window.getDeviceFingerprint()
            },
            body: JSON.stringify({
                action: 'new_chat',
                chat: {
                    id: chat.id,
                    topic_id: chat.topic,
                    title: chat.title,
                    max_context: chat.maxContext,
                    user_renamed: chat.userRenamed
                },
                firstMessage: chat.messages[0] ? {
                    type: chat.messages[0].type,
                    text: chat.messages[0].text,
                    is_favorite: false
                } : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Если сервер вернул новый ID чата — обновляем локально
            if (data.chatId && data.chatId !== chat.id) {
                chat.id = data.chatId;
                window.activeChatIds[window.currentTopic] = data.chatId;
                window.saveHistoriesToLocal();
            }
            if (data.messageId && chat.messages[0]) {
                chat.messages[0].id = data.messageId;
                chat.messages[0].synced = true;
                window.saveHistoriesToLocal();
            }
            console.log(`Чат ${chat.id} синхронизирован с облаком`);
        } else {
            console.error("Ошибка синхронизации нового чата:", data.error);
        }
    } catch (err) {
        console.error("Сбой синхронизации нового чата:", err);
    }
};

// Также добавляем функцию для повторной синхронизации чатов
window.retryUnsyncedChats = async function() {
    if (!window.config.syncEnabled) return;
    if (!window.unsyncedChats || window.unsyncedChats.length === 0) return;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    
    const failedAgain = [];
    
    for (const item of window.unsyncedChats) {
        try {
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({
                    action: 'new_chat',
                    chat: {
                        id: item.chat.id,
                        topic_id: item.chat.topic,
                        title: item.chat.title,
                        max_context: item.chat.maxContext,
                        user_renamed: item.chat.userRenamed
                    },
                    firstMessage: {
                        id: item.welcomeMsgId,
                        type: 'ai-msg',
                        text: item.welcomeText,
                        is_favorite: false
                    }
                })
            });
            
            const data = await response.json();
            if (!data.success) {
                failedAgain.push(item);
            }
        } catch (err) {
            console.error("Ошибка повторной синхронизации чата:", err);
            failedAgain.push(item);
        }
    }
    
    window.unsyncedChats = failedAgain;
    window.saveHistoriesToLocal();
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
    window.applyUiLocalization(); 
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
        
        // Если синхронизация включена, удаляем чат и на сервере
        if (window.config.syncEnabled && chatId) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                fetch('/api/chats/action', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initData
                    },
                    body: JSON.stringify({
                        action: 'delete_chat',
                        chatId: chatId
                    })
                }).catch(err => console.error("Ошибка удаления чата на сервере:", err));
            }
        }
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_chat'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_chat'))) {
        action();
    }
};

window.renameChat = function(event, chatId) {
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
        
        // Синхронизация переименования
        if (window.config.syncEnabled && chatId) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                fetch('/api/chats/action', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initData
                    },
                    body: JSON.stringify({
                        action: 'rename_chat',
                        chatId: chatId,
                        newTitle: newTitle.trim()
                    })
                }).catch(err => console.error("Ошибка синхронизации переименования:", err));
            }
        }
    }
};

window.deleteMessage = function(msgId) {
    const action = () => {
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
        
        // Синхронизация удаления сообщения
        if (window.config.syncEnabled && activeChat.id) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                fetch('/api/chats/action', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initData
                    },
                    body: JSON.stringify({
                        action: 'delete_message',
                        chatId: activeChat.id,
                        messageId: msgId
                    })
                }).catch(err => console.error("Ошибка синхронизации удаления сообщения:", err));
            }
        }
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_msg'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_msg'))) {
        action();
    }
};

// Новая функция: пометить сообщения как синхронизированные
window.markMessagesSynced = function(chatId, messageIds) {
    const activeChat = window.getCurrentActiveChat();
    if (!activeChat || activeChat.id !== chatId) return;
    
    let updated = false;
    activeChat.messages.forEach(msg => {
        if (messageIds.includes(msg.id) && !msg.synced) {
            msg.synced = true;
            updated = true;
        }
    });
    
    if (updated) {
        window.saveHistoriesToLocal();
    }
};

// Новая функция: добавить сообщение в очередь unsynced для повторной попытки
window.addToUnsyncedQueue = function(chatId, message) {
    window.unsyncedMessages = window.unsyncedMessages || [];
    window.unsyncedMessages.push({
        chatId: chatId,
        message: message,
        topicId: window.currentTopic,
        chatTitle: window.getCurrentActiveChat()?.title,
        maxContext: window.getCurrentActiveChat()?.maxContext,
        userRenamed: window.getCurrentActiveChat()?.userRenamed,
        timestamp: new Date().toISOString()
    });
    window.saveHistoriesToLocal();
};

// Новая функция: повторить отправку unsynced сообщений
window.retryUnsyncedMessages = async function() {
    if (!window.config.syncEnabled) return;
    if (!window.unsyncedMessages || window.unsyncedMessages.length === 0) return;
    
    console.log(`🔄 Повторная отправка ${window.unsyncedMessages.length} несинхронизированных сообщений...`);
    
    const failedAgain = [];
    
    for (const item of window.unsyncedMessages) {
        try {
            const initData = window.Telegram?.WebApp?.initData;
            if (!initData) continue;
            
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({
                    action: 'new_message',
                    chatId: item.chatId,
                    topicId: item.topicId,
                    chatTitle: item.chatTitle,
                    maxContext: item.maxContext,
                    userRenamed: item.userRenamed,
                    message: item.message
                })
            });
            
            const data = await response.json();
            
            if (data.synced === true) {
                // Успешно синхронизировано
                window.markMessagesSynced(item.chatId, [item.message.id]);
            } else {
                // Не синхронизировано, добавим в失败的 список
                failedAgain.push(item);
            }
        } catch (err) {
            console.error("Ошибка повторной синхронизации:", err);
            failedAgain.push(item);
        }
    }
    
    window.unsyncedMessages = failedAgain;
    window.saveHistoriesToLocal();
    
    if (failedAgain.length === 0) {
        console.log("✅ Все сообщения успешно синхронизированы!");
    } else {
        console.log(`⚠️ ${failedAgain.length} сообщений ожидают повторной синхронизации`);
    }
};

window.addMessageToStorage = async function(text, className) {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    const activeChat = window.getCurrentActiveChat();
    
    const generatedMsgId = window.generateUUID(); 
    
    if (activeChat) {
        const newMsg = {
            id: generatedMsgId,
            text: text,
            type: className,
            isFavorite: false,
            synced: false // Новое сообщение пока не синхронизировано
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

        // Синхронизация с облаком (только если включена)
        if (window.config.syncEnabled && activeChat.id) {
            try {
                const initData = window.Telegram?.WebApp?.initData;
                if (initData) {
                    const response = await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Telegram-Init-Data': initData
                        },
                        body: JSON.stringify({
                            action: 'new_message',
                            chatId: activeChat.id,
                            topicId: window.currentTopic,
                            chatTitle: activeChat.title,
                            maxContext: activeChat.maxContext,
                            userRenamed: activeChat.userRenamed || false,
                            message: {
                                id: generatedMsgId,
                                text: text,
                                type: className,
                                isFavorite: false
                            }
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.synced === true) {
                        // Помечаем сообщение как синхронизированное
                        window.markMessagesSynced(activeChat.id, [generatedMsgId]);
                    } else if (data.error && data.error.includes('Синхронизация недоступна')) {
                        // Пользователь больше не PRO, отключаем синхронизацию
                        window.config.syncEnabled = false;
                        console.warn("Синхронизация отключена: тарифный план не поддерживает облачное хранение");
                    } else {
                        // Добавляем в очередь для повторной попытки
                        window.addToUnsyncedQueue(activeChat.id, {
                            id: generatedMsgId,
                            text: text,
                            type: className,
                            isFavorite: false
                        });
                    }
                }
            } catch (err) {
                console.error("Ошибка отправки сообщения на сервер:", err);
                // Добавляем в очередь для повторной попытки
                window.addToUnsyncedQueue(activeChat.id, {
                    id: generatedMsgId,
                    text: text,
                    type: className,
                    isFavorite: false
                });
            }
        }
    }
};
