// js/core/storage.js
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

function getCurrentUserId() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return user?.id || 'anonymous';
}

window.loadLocalHistories = function() {
    const userId = getCurrentUserId();
    const storageKey = `tg_chat_histories_${userId}`;
    const activeKey = `active_chat_ids_${userId}`;
    const unsyncedKey = `unsynced_messages_${userId}`;
    const unsyncedFavKey = `unsynced_favorites_${userId}`;
    const unsyncedChatsKey = `unsynced_chats_${userId}`;
    const todoKey = `tg_organizer_todo_list_${userId}`;
    
    try { 
        window.chatHistories = JSON.parse(localStorage.getItem(storageKey) || '{}'); 
    } catch(e) { 
        window.chatHistories = {}; 
    }
    
    try { 
        window.activeChatIds = JSON.parse(localStorage.getItem(activeKey) || '{}'); 
    } catch(e) { 
        window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null }; 
    }
    
    try { 
        window.unsyncedMessages = JSON.parse(localStorage.getItem(unsyncedKey) || '[]'); 
    } catch(e) { 
        window.unsyncedMessages = []; 
    }
    
    try { 
        window.unsyncedFavorites = JSON.parse(localStorage.getItem(unsyncedFavKey) || '[]'); 
    } catch(e) { 
        window.unsyncedFavorites = []; 
    }
    
    try { 
        window.unsyncedChats = JSON.parse(localStorage.getItem(unsyncedChatsKey) || '[]'); 
    } catch(e) { 
        window.unsyncedChats = []; 
    }
    
    try { 
        window.todoItemsList = JSON.parse(localStorage.getItem(todoKey) || '[]'); 
    } catch(e) { 
        window.todoItemsList = []; 
    }
    
    console.log(`📁 Данные загружены для пользователя ${userId}`);
};

window.saveHistoriesToLocal = function() {
    const userId = getCurrentUserId();
    const storageKey = `tg_chat_histories_${userId}`;
    const activeKey = `active_chat_ids_${userId}`;
    const unsyncedKey = `unsynced_messages_${userId}`;
    const unsyncedFavKey = `unsynced_favorites_${userId}`;
    const unsyncedChatsKey = `unsynced_chats_${userId}`;
    const todoKey = `tg_organizer_todo_list_${userId}`;
    
    try {
        localStorage.setItem(storageKey, JSON.stringify(window.chatHistories));
        localStorage.setItem(activeKey, JSON.stringify(window.activeChatIds));
        localStorage.setItem(unsyncedKey, JSON.stringify(window.unsyncedMessages));
        localStorage.setItem(unsyncedFavKey, JSON.stringify(window.unsyncedFavorites || []));
        localStorage.setItem(unsyncedChatsKey, JSON.stringify(window.unsyncedChats || []));
        localStorage.setItem(todoKey, JSON.stringify(window.todoItemsList || []));
    } catch (e) { 
        console.error("Превышен лимит localStorage:", e); 
    }
};

window.findChatInAllTopics = function(chatId) {
    for (const [topic, chats] of Object.entries(window.chatHistories || {})) {
        if (!chats) continue;
        const chat = chats.find(c => c.id === chatId);
        if (chat) {
            return { chat, topic };
        }
    }
    return null;
};

window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

window.hasRealMessages = function(chat) {
    if (!chat || !chat.messages) return false;
    return chat.messages.some(m => (m.type === 'user-msg' || m.type === 'ai-msg') && !m.deleted_at);
};

window.createTempChat = function() {
    const topic = window.currentTopic;
    const sectionName = window.topicNames[topic] || topic;
    
    const existingTemp = window.chatHistories[topic]?.find(c => !c.synced && !c.deleted_at && (!c.messages || c.messages.length === 0));
    if (existingTemp) {
        window.activeChatIds[topic] = existingTemp.id;
        window.saveHistoriesToLocal();
        return existingTemp;
    }
    
    const newId = window.generateUUID();
    const tempChat = {
        id: newId,
        title: `Новый чат в ${sectionName}`,
        maxContext: 15,
        language: window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru',
        topic: topic,
        userRenamed: false,
        synced: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: []
    };
    
    if (!window.chatHistories[topic]) {
        window.chatHistories[topic] = [];
    }
    window.chatHistories[topic].unshift(tempChat);
    window.activeChatIds[topic] = newId;
    window.saveHistoriesToLocal();
    
    console.log(`📝 Создан пустой временный чат ${newId} в теме ${topic}`);
    return tempChat;
};

window.createChatInCloud = async function(chat) {
    if (!chat || chat.synced) return true;
    if (!window.hasRealMessages(chat)) {
        console.log(`⏸️ Чат ${chat.id} пустой, синхронизация не требуется`);
        return false;
    }
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.error('Нет initData для создания чата в облаке');
        return false;
    }
    
    const firstUserMessage = chat.messages.find(m => m.type === 'user-msg' && !m.deleted_at);
    if (!firstUserMessage) {
        console.warn('Нет сообщений пользователя для создания чата');
        return false;
    }
    
    const oldId = chat.id;
    const topic = chat.topic || window.currentTopic;
    
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
                    id: chat.id,
                    topic_id: topic,
                    title: chat.title || `Чат в ${window.topicNames[topic] || topic}`,
                    max_context: chat.maxContext || 15,
                    user_renamed: chat.userRenamed || false
                },
                firstMessage: {
                    id: firstUserMessage.id,
                    type: firstUserMessage.type,
                    text: firstUserMessage.text,
                    is_favorite: firstUserMessage.isFavorite || false
                }
            })
        });
        
        const data = await response.json();
        console.log('📤 Результат создания чата в облаке:', data);
        
        if (data.success) {
            const newId = data.chatId || chat.id;
            if (newId !== oldId) {
                chat.id = newId;
                if (window.activeChatIds[topic] === oldId) {
                    window.activeChatIds[topic] = newId;
                }
                const topicChats = window.chatHistories[topic] || [];
                const filtered = topicChats.filter(c => c.id !== oldId || c.id === newId);
                if (filtered.length !== topicChats.length) {
                    window.chatHistories[topic] = filtered;
                }
                window.saveHistoriesToLocal();
            }
            chat.synced = true;
            for (const msg of chat.messages) {
                if (!msg.synced && !msg.deleted_at) {
                    await window.syncMessageToCloud(chat.id, msg);
                }
            }
            return true;
        } else {
            console.error('Ошибка создания чата в облаке:', data.error);
            return false;
        }
    } catch (err) {
        console.error('Ошибка создания чата в облаке:', err);
        return false;
    }
};

window.addMessageToStorage = async function(text, className) {
    if (!window.chatHistories[window.currentTopic]) {
        window.chatHistories[window.currentTopic] = [];
    }
    
    let activeChat = window.getCurrentActiveChat();
    if (!activeChat) {
        activeChat = window.createTempChat();
    }
    
    const newMsg = {
        id: window.generateUUID(),
        text: text,
        type: className,
        isFavorite: false,
        synced: false,
        deleted_at: null,
        created_at: new Date().toISOString()
    };
    
    activeChat.messages.push(newMsg);
    activeChat.updated_at = new Date().toISOString();
    
    const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
    const startTitle = `Новый чат в ${sectionName}`;
    if (className === 'user-msg' && (!activeChat.userRenamed || activeChat.title === startTitle)) {
        const newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
        activeChat.title = newTitle;
    }
    
    window.saveHistoriesToLocal();
    
    if (typeof window.renderMessageToDOM === 'function') {
        window.renderMessageToDOM(text, className, newMsg.id);
    }
    
    if (window.config.syncEnabled && window.hasRealMessages(activeChat)) {
        if (!activeChat.synced) {
            const created = await window.createChatInCloud(activeChat);
            if (created) {
                console.log(`✅ Чат ${activeChat.id} создан в облаке, сообщения синхронизированы`);
            }
        } else {
            try {
                await window.syncMessageToCloud(activeChat.id, newMsg);
            } catch (err) {
                console.error('Ошибка синхронизации сообщения:', err);
                window.addToUnsyncedQueue(activeChat.id, newMsg);
            }
        }
    }
    
    if (typeof window.renderHistoryChatsList === 'function') {
        window.renderHistoryChatsList(window.currentFilter || 'all');
    }
};

window.cleanupTempChats = function() {
    let cleaned = 0;
    const now = new Date();
    const maxAgeMinutes = 5;
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    
    for (const [topic, chats] of Object.entries(window.chatHistories || {})) {
        if (!chats || !Array.isArray(chats)) continue;
        const filtered = chats.filter(chat => {
            if (chat.synced) return true;
            if (window.hasRealMessages(chat)) return true;
            const createdAt = new Date(chat.created_at);
            const age = now - createdAt;
            if (age > maxAgeMs) {
                cleaned++;
                console.log(`🗑️ Удалён пустой временный чат (${Math.round(age/60000)} мин): ${chat.title}`);
                return false;
            }
            return true;
        });
        if (filtered.length !== chats.length) {
            window.chatHistories[topic] = filtered;
        }
    }
    if (cleaned > 0) {
        window.saveHistoriesToLocal();
    }
    return cleaned;
};

window.switchTopic = function(topic) {
    const currentChat = window.getCurrentActiveChat();
    if (currentChat && !currentChat.synced && !window.hasRealMessages(currentChat)) {
        const topicChats = window.chatHistories[window.currentTopic] || [];
        window.chatHistories[window.currentTopic] = topicChats.filter(c => c.id !== currentChat.id);
        window.activeChatIds[window.currentTopic] = null;
        console.log(`🗑️ Удалён пустой временный чат при переключении`);
    }
    window.currentTopic = topic;
    document.querySelectorAll('.tag-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.topic === topic);
    });
    window.createTempChat();
    window.saveHistoriesToLocal();
    window.refreshUiAfterChatSelection();
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
};

window.refreshUiAfterChatSelection = function() {
    window.applyUiLocalization(); 
    if (typeof window.loadActiveChatMessages === 'function') {
        window.loadActiveChatMessages();
    }
    if (typeof window.renderHistoryChatsList === 'function') {
        window.renderHistoryChatsList(window.currentFilter || 'all');
    }
    if (typeof window.syncContextSliderWithActiveChat === 'function') {
        window.syncContextSliderWithActiveChat();
    }
    if (typeof window.renderTagsCloud === 'function') {
        window.renderTagsCloud();
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
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
};

window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    const action = () => {
        const found = window.findChatInAllTopics(chatId);
        if (!found) {
            console.warn('❌ Чат не найден для удаления:', chatId);
            if (window.tg?.showAlert) {
                window.tg.showAlert('❌ Чат не найден');
            }
            return;
        }
        const { chat: chatToDelete, topic } = found;
        const chatTitle = chatToDelete.title || 'Чат';
        if (!chatToDelete.synced && !window.hasRealMessages(chatToDelete)) {
            const topicChats = window.chatHistories[topic] || [];
            window.chatHistories[topic] = topicChats.filter(c => c.id !== chatId);
            if (window.activeChatIds[topic] === chatId) {
                window.activeChatIds[topic] = null;
            }
            window.saveHistoriesToLocal();
            window.refreshUiAfterChatSelection();
            if (window.tg?.showAlert) {
                window.tg.showAlert(`🗑️ "${chatTitle}" удалён (временный чат)`);
            }
            return;
        }
        chatToDelete.deleted_at = new Date().toISOString();
        const topicChats = window.chatHistories[topic] || [];
        window.chatHistories[topic] = topicChats.filter(c => c.id !== chatId);
        if (window.activeChatIds[topic] === chatId) {
            const remainingChats = window.chatHistories[topic];
            window.activeChatIds[topic] = remainingChats[0]?.id || null;
        }
        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
        if (window.config.syncEnabled && chatId && chatToDelete.synced) {
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
                }).catch(err => console.error("Ошибка удаления чата:", err));
            }
        }
        if (window.tg?.showAlert) {
            window.tg.showAlert(`🗑️ "${chatTitle}" перемещён в корзину`);
        }
    };
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_chat') : 'Переместить чат в корзину?';
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

window.renameChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation();
    const found = window.findChatInAllTopics(chatId);
    if (!found) {
        console.warn('❌ Чат не найден для переименования:', chatId);
        return;
    }
    const { chat, topic } = found;
    const newTitle = prompt(window.getLangString('prompt_rename'), chat.title);
    if (newTitle && newTitle.trim().length > 0) {
        chat.title = newTitle.trim();
        chat.userRenamed = true; 
        window.saveHistoriesToLocal();
        if (typeof window.renderHistoryChatsList === 'function') {
            window.renderHistoryChatsList(window.currentFilter || 'all');
        }
        if (window.config.syncEnabled && chatId && chat.synced) {
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
        const msg = activeChat.messages.find(m => m.id === msgId);
        if (msg) {
            msg.deleted_at = new Date().toISOString();
        }
        activeChat.messages = activeChat.messages.filter(m => m.id !== msgId);
        window.saveHistoriesToLocal();
        const domBlock = document.getElementById(`msg-block-${msgId}`);
        if (domBlock) {
            domBlock.style.transition = 'all 0.25s ease';
            domBlock.style.opacity = '0';
            domBlock.style.transform = 'scale(0.95)';
            setTimeout(() => { domBlock.remove(); }, 250);
        }
        if (window.config.syncEnabled && activeChat.id && activeChat.synced) {
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
                window.markMessagesSynced(item.chatId, [item.message.id]);
            } else {
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

window.createNewChat = function() {
    const card = document.getElementById('profile-card');
    if (card) {
        card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
    }
    const newChat = window.createTempChat();
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
    window.refreshUiAfterChatSelection();
    return newChat;
};

window.saveLastChat = function() {
    const activeChat = window.getCurrentActiveChat();
    if (activeChat && activeChat.synced) {
        localStorage.setItem('last_topic', window.currentTopic);
        localStorage.setItem(`last_chat_${window.currentTopic}`, activeChat.id);
    }
};

window.addEventListener('beforeunload', function() {
    window.saveLastChat();
    window.cleanupTempChats();
});

console.log('✅ storage.js загружен');
