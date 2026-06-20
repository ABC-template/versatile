// js/core/storage.js - ПОЛНОСТЬЮ ПЕРЕПИСАН (НОВАЯ ВЕРСИЯ)

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

// ==========================================
// ЗАГРУЗКА ЛОКАЛЬНЫХ ДАННЫХ
// ==========================================

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
    
    // Восстанавливаем последний активный чат
    const lastTopic = localStorage.getItem('last_topic');
    if (lastTopic && window.chatHistories[lastTopic]) {
        const lastChatId = localStorage.getItem(`last_chat_${lastTopic}`);
        if (lastChatId) {
            const chat = window.chatHistories[lastTopic].find(c => c.id === lastChatId && !c.deleted_at);
            if (chat) {
                window.currentTopic = lastTopic;
                window.activeChatIds[lastTopic] = lastChatId;
            }
        }
    }
    
    console.log(`📁 Данные загружены для пользователя ${userId}`);
};

// ==========================================
// СОХРАНЕНИЕ ЛОКАЛЬНЫХ ДАННЫХ
// ==========================================

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

// ==========================================
// ПОЛУЧЕНИЕ ТЕКУЩЕГО АКТИВНОГО ЧАТА
// ==========================================

window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

// ==========================================
// СОЗДАНИЕ ВРЕМЕННОГО ЧАТА (БЕЗ БД)
// ==========================================

window.createTempChat = function() {
    const topic = window.currentTopic;
    const sectionName = window.topicNames[topic] || topic;
    const welcomeText = window.welcomeTexts[topic] || 'Привет! Чем могу помочь?';
    
    // Проверяем, есть ли уже временный чат (несозданный в БД)
    const existingTemp = window.chatHistories[topic]?.find(c => !c.synced && !c.deleted_at);
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
        synced: false,          // ← НЕ В БД!
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [{
            id: window.generateUUID(),
            text: welcomeText,
            type: "ai-msg",
            isFavorite: false,
            synced: false,
            deleted_at: null,
            created_at: new Date().toISOString()
        }]
    };
    
    if (!window.chatHistories[topic]) {
        window.chatHistories[topic] = [];
    }
    window.chatHistories[topic].unshift(tempChat);
    window.activeChatIds[topic] = newId;
    window.saveHistoriesToLocal();
    
    console.log(`📝 Создан временный чат ${newId} в теме ${topic}`);
    return tempChat;
};

// ==========================================
// СОЗДАНИЕ ЧАТА В БД (ТОЛЬКО ПРИ ПЕРВОМ СООБЩЕНИИ)
// ==========================================

window.createChatInCloud = async function(chat) {
    if (!chat || chat.synced) return true;
    if (!chat.messages || chat.messages.length <= 1) return false;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.error('Нет initData для создания чата в облаке');
        return false;
    }
    
    // Находим первое сообщение пользователя (не приветствие)
    const firstUserMessage = chat.messages.find(m => m.type === 'user-msg' && !m.deleted_at);
    if (!firstUserMessage) {
        console.warn('Нет сообщений пользователя для создания чата');
        return false;
    }
    
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
                    topic_id: chat.topic || window.currentTopic,
                    title: chat.title || `Чат в ${window.topicNames[chat.topic] || chat.topic}`,
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
            chat.synced = true;
            if (data.chatId) {
                chat.id = data.chatId;
            }
            window.saveHistoriesToLocal();
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

// ==========================================
// УДАЛЕНИЕ ПУСТЫХ ВРЕМЕННЫХ ЧАТОВ
// ==========================================

window.cleanupTempChats = function() {
    let cleaned = 0;
    for (const [topic, chats] of Object.entries(window.chatHistories || {})) {
        if (!chats || !Array.isArray(chats)) continue;
        const filtered = chats.filter(chat => {
            // Удаляем временные чаты без сообщений пользователя
            if (!chat.synced && chat.messages && chat.messages.length <= 1) {
                cleaned++;
                return false;
            }
            return true;
        });
        if (filtered.length !== chats.length) {
            window.chatHistories[topic] = filtered;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Удалено ${cleaned} пустых временных чатов`);
        window.saveHistoriesToLocal();
    }
    return cleaned;
};

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ МЕЖДУ ТЕГАМИ
// ==========================================

window.switchTopic = function(topic) {
    // 1. Проверяем текущий чат
    const currentChat = window.getCurrentActiveChat();
    if (currentChat && !currentChat.synced && currentChat.messages && currentChat.messages.length <= 1) {
        // Если временный чат без сообщений — удаляем
        const topicChats = window.chatHistories[window.currentTopic] || [];
        window.chatHistories[window.currentTopic] = topicChats.filter(c => c.id !== currentChat.id);
        window.activeChatIds[window.currentTopic] = null;
        console.log(`🗑️ Удалён пустой временный чат при переключении с ${window.currentTopic} на ${topic}`);
    }
    
    // 2. Переключаемся на новый тег
    window.currentTopic = topic;
    
    // 3. Обновляем активный чип
    document.querySelectorAll('.tag-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.topic === topic);
    });
    
    // 4. Проверяем, есть ли сохранённый чат для этого тега
    const lastChatId = localStorage.getItem(`last_chat_${topic}`);
    if (lastChatId) {
        const chat = window.chatHistories[topic]?.find(c => c.id === lastChatId && !c.deleted_at);
        if (chat) {
            window.activeChatIds[topic] = lastChatId;
            window.saveHistoriesToLocal();
            window.refreshUiAfterChatSelection();
            // Показываем чат
            if (typeof window.showChatInterface === 'function') {
                window.showChatInterface();
            }
            return;
        }
    }
    
    // 5. Проверяем, есть ли синхронизированные чаты в этом теге
    const existingChats = (window.chatHistories[topic] || []).filter(c => c.synced && !c.deleted_at);
    if (existingChats.length > 0) {
        window.activeChatIds[topic] = existingChats[0].id;
        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
        if (typeof window.showChatInterface === 'function') {
            window.showChatInterface();
        }
        return;
    }
    
    // 6. Создаём временный чат с приветствием
    window.createTempChat();
    window.saveHistoriesToLocal();
    window.refreshUiAfterChatSelection();
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
};

// ==========================================
// ДОБАВЛЕНИЕ СООБЩЕНИЯ (ОСНОВНАЯ ФУНКЦИЯ)
// ==========================================

window.addMessageToStorage = async function(text, className) {
    if (!window.chatHistories[window.currentTopic]) {
        window.chatHistories[window.currentTopic] = [];
    }
    
    let activeChat = window.getCurrentActiveChat();
    
    // Если нет активного чата — создаём временный
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
    
    // Если это первое сообщение пользователя — создаём чат в БД
    if (className === 'user-msg' && !activeChat.synced) {
        const created = await window.createChatInCloud(activeChat);
        if (!created) {
            console.warn('⚠️ Не удалось создать чат в облаке, сообщение будет сохранено локально');
        }
    }
    
    // Обновляем название чата (если пользователь не переименовал)
    const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
    const startTitle = `Новый чат в ${sectionName}`;
    if (className === 'user-msg' && (!activeChat.userRenamed || activeChat.title === startTitle)) {
        const newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
        activeChat.title = newTitle;
    }
    
    window.saveHistoriesToLocal();
    
    // Рендерим сообщение в DOM
    if (typeof window.renderMessageToDOM === 'function') {
        window.renderMessageToDOM(text, className, newMsg.id);
    }
    if (typeof window.renderHistoryChatsList === 'function') {
        window.renderHistoryChatsList(window.currentFilter || 'all');
    }

    // Синхронизация сообщения (если чат уже в БД)
    if (window.config.syncEnabled && activeChat.synced && activeChat.id) {
        try {
            const result = await window.syncMessageToCloud(activeChat.id, newMsg);
            if (!result) {
                window.addToUnsyncedQueue(activeChat.id, newMsg);
            }
        } catch (err) {
            console.error('Ошибка синхронизации сообщения:', err);
            window.addToUnsyncedQueue(activeChat.id, newMsg);
        }
    }
    
    // Увеличиваем счётчик использования
    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && className === 'user-msg' && typeof window.incrementUsage === 'function') {
        window.incrementUsage();
    }
};

// ==========================================
// ОБНОВЛЕНИЕ UI ПОСЛЕ ВЫБОРА ЧАТА
// ==========================================

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

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ НА ЧАТ ПО ID
// ==========================================

window.switchActiveChat = async function(chatId) {
    window.activeChatIds[window.currentTopic] = chatId;
    window.saveHistoriesToLocal();
    
    // Сохраняем последний чат
    localStorage.setItem('last_topic', window.currentTopic);
    localStorage.setItem(`last_chat_${window.currentTopic}`, chatId);
    
    if (window.config && window.config.syncEnabled && typeof window.loadFullChat === 'function') {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
            await window.loadFullChat(chatId);
        }
    }
    window.refreshUiAfterChatSelection();
    
    // Показываем интерфейс чата
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
};

// ==========================================
// ВОССТАНОВЛЕНИЕ ПОСЛЕДНЕГО ЧАТА
// ==========================================

window.restoreLastChat = function() {
    const lastTopic = localStorage.getItem('last_topic') || 'code';
    const lastChatId = localStorage.getItem(`last_chat_${lastTopic}`);
    
    window.currentTopic = lastTopic;
    
    if (lastChatId) {
        const chat = window.chatHistories[lastTopic]?.find(c => c.id === lastChatId && !c.deleted_at);
        if (chat) {
            window.activeChatIds[lastTopic] = lastChatId;
            window.saveHistoriesToLocal();
            window.refreshUiAfterChatSelection();
            if (typeof window.showChatInterface === 'function') {
                window.showChatInterface();
            }
            return;
        }
    }
    
    // Если нет сохранённого чата — создаём временный
    window.switchTopic(lastTopic);
};

// ==========================================
// СОХРАНЕНИЕ ПОСЛЕДНЕГО ЧАТА ПРИ ЗАКРЫТИИ
// ==========================================

window.saveLastChat = function() {
    const activeChat = window.getCurrentActiveChat();
    if (activeChat && activeChat.synced) {
        localStorage.setItem('last_topic', window.currentTopic);
        localStorage.setItem(`last_chat_${window.currentTopic}`, activeChat.id);
    }
};

// Перехватываем закрытие страницы
window.addEventListener('beforeunload', function() {
    window.saveLastChat();
    window.cleanupTempChats();
});

// ==========================================
// УДАЛЕНИЕ ЧАТА (В КОРЗИНУ)
// ==========================================

window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    
    const action = () => {
        let modelsChats = window.chatHistories[window.currentTopic] || [];
        const chatToDelete = modelsChats.find(c => c.id === chatId);
        
        if (!chatToDelete) {
            console.warn('Чат не найден для удаления:', chatId);
            return;
        }
        
        const chatTitle = chatToDelete.title || 'Чат';
        
        // Если чат временный (не в БД) — просто удаляем локально
        if (!chatToDelete.synced) {
            window.chatHistories[window.currentTopic] = modelsChats.filter(c => c.id !== chatId);
            if (window.activeChatIds[window.currentTopic] === chatId) {
                const remainingChats = window.chatHistories[window.currentTopic];
                window.activeChatIds[window.currentTopic] = remainingChats[0]?.id || null;
            }
            window.saveHistoriesToLocal();
            window.refreshUiAfterChatSelection();
            
            if (window.tg?.showAlert) {
                window.tg.showAlert(`🗑️ "${chatTitle}" удалён (временный чат)`);
            }
            return;
        }
        
        // Помечаем чат как удалённый
        chatToDelete.deleted_at = new Date().toISOString();
        window.chatHistories[window.currentTopic] = modelsChats.filter(c => c.id !== chatId);

        if (window.activeChatIds[window.currentTopic] === chatId) {
            const remainingChats = window.chatHistories[window.currentTopic];
            window.activeChatIds[window.currentTopic] = remainingChats[0]?.id || null;
        }

        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
        
        // Отправляем на сервер (soft delete)
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
                        if (typeof window.loadTrashItems === 'function') {
                            window.loadTrashItems();
                        }
                    }
                })
                .catch(err => console.error("Ошибка удаления чата:", err));
            }
        }
        
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

// ==========================================
// ПЕРЕИМЕНОВАНИЕ ЧАТА
// ==========================================

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

// ==========================================
// УДАЛЕНИЕ СООБЩЕНИЯ
// ==========================================

window.deleteMessage = function(msgId) {
    const action = () => {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat) return;

        // Помечаем сообщение как удалённое
        const msg = activeChat.messages.find(m => m.id === msgId);
        if (msg) {
            msg.deleted_at = new Date().toISOString();
        }
        
        // Удаляем из отображения
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

// ==========================================
// ОТМЕТКА СООБЩЕНИЙ КАК СИНХРОНИЗИРОВАННЫХ
// ==========================================

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

// ==========================================
// ДОБАВЛЕНИЕ В ОЧЕРЕДЬ НЕСИНХРОНИЗИРОВАННЫХ
// ==========================================

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

// ==========================================
// ПОВТОРНАЯ ОТПРАВКА НЕСИНХРОНИЗИРОВАННЫХ СООБЩЕНИЙ
// ==========================================

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

// ==========================================
// КОНСТРУКТОР НОВОГО ЧАТА (ДЛЯ КНОПКИ "+ НОВЫЙ ЧАТ")
// ==========================================

window.createNewChat = async function() {
    if (!window.chatHistories[window.currentTopic]) {
        window.chatHistories[window.currentTopic] = [];
    }
    
    // Закрываем профиль
    const card = document.getElementById('profile-card');
    if (card) {
        card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
    }
    
    // Создаём временный чат
    const newChat = window.createTempChat();
    
    // Показываем интерфейс чата
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
    
    window.refreshUiAfterChatSelection();
    
    return newChat;
};

console.log('✅ storage.js полностью загружен (новая версия)');
