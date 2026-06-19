// js/core/storage.js - ПОЛНОСТЬЮ ПЕРЕПИСАН (БЕЗ УДАЛЕНИЯ)

// Глобальный генератор валидных UUID для Supabase
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

// Получение текущего user_id для изоляции хранилища
function getCurrentUserId() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return user?.id || 'anonymous';
}

// Загрузка локальных данных с привязкой к user_id
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
    
    // Загружаем To-Do лист для этого пользователя
    try { 
        window.todoItemsList = JSON.parse(localStorage.getItem(todoKey) || '[]'); 
    } catch(e) { 
        window.todoItemsList = []; 
    }
    
    console.log(`📁 Данные загружены для пользователя ${userId}`);
};

// Сохранение локальных данных с привязкой к user_id
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

// Получение текущего активного чата
window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

// Создание нового чата (с привязкой к пользователю)
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
    
    if (window.config.syncEnabled) {
        await window.syncNewChatToCloud(newChat);
    }
};

// Остальные функции остаются без изменений
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

// ==========================================
// УДАЛЕНИЕ ЧАТА (В КОРЗИНУ)
// ==========================================

window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    
    const action = () => {
        // 1. Находим чат
        let modelsChats = window.chatHistories[window.currentTopic] || [];
        const chatToDelete = modelsChats.find(c => c.id === chatId);
        
        if (!chatToDelete) {
            console.warn('Чат не найден для удаления:', chatId);
            return;
        }
        
        // 2. Сохраняем название для уведомления
        const chatTitle = chatToDelete.title || 'Чат';
        
        // 3. Удаляем из списка (скрываем)
        window.chatHistories[window.currentTopic] = modelsChats.filter(c => c.id !== chatId);

        if (window.activeChatIds[window.currentTopic] === chatId) {
            const remainingChats = window.chatHistories[window.currentTopic];
            window.activeChatIds[window.currentTopic] = remainingChats[0]?.id || null;
        }

        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
        
        // 4. Отправляем на сервер (soft delete)
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
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log(`✅ Чат ${chatId} отправлен в корзину`);
                        // Обновляем счётчик корзины
                        if (typeof window.loadTrashItems === 'function') {
                            window.loadTrashItems();
                        }
                    }
                })
                .catch(err => console.error("Ошибка удаления чата:", err));
            }
        }
        
        // 5. Показываем уведомление
        const msg = `🗑️ "${chatTitle}" перемещён в корзину`;
        if (window.tg?.showAlert) {
            window.tg.showAlert(msg);
        } else {
            console.log(msg);
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
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const chat = modelsChats.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt(window.getLangString('prompt_rename'), chat.title);
    if (newTitle && newTitle.trim().length > 0) {
        chat.title = newTitle.trim();
        chat.userRenamed = true; 
        window.saveHistoriesToLocal();
        if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        
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
            synced: false
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
                        window.markMessagesSynced(activeChat.id, [generatedMsgId]);
                    } else if (data.error && data.error.includes('Синхронизация недоступна')) {
                        window.config.syncEnabled = false;
                        console.warn("Синхронизация отключена: тарифный план не поддерживает облачное хранение");
                    } else {
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
