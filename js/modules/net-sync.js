// js/modules/net-sync.js

// Синхронизация метаданных (список чатов и избранное)
window.syncChatsMetadata = async function() {
    if (!window.config.syncEnabled) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    try {
        const response = await fetch('/api/chats/sync-metadata', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        if (data.syncEnabled && data.chats) {
            if (!window.cloudChatsMeta) window.cloudChatsMeta = {};
            
            data.chats.forEach(chat => {
                const existingMeta = window.cloudChatsMeta[chat.id];
                if (!existingMeta || new Date(chat.updated_at) > new Date(existingMeta.updated_at)) {
                    window.cloudChatsMeta[chat.id] = chat;
                }
            });
            
            if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        }
        if (data.favorites) {
            window.cloudFavorites = data.favorites;
        }
    } catch (err) {
        console.error("Ошибка синхронизации метаданных:", err);
    }
};

// Конфликт-резолвинг: сравниваем updated_at и решаем, кто победил
window.resolveChatConflict = function(localChat, serverChat) {
    if (!localChat || !serverChat) return { winner: 'server', chat: serverChat };
    
    const localTime = new Date(localChat.updated_at || localChat.created_at).getTime();
    const serverTime = new Date(serverChat.updated_at).getTime();
    
    if (serverTime > localTime) {
        return { winner: 'server', chat: serverChat };
    } else if (localTime > serverTime) {
        return { winner: 'local', chat: localChat };
    } else {
        return { winner: 'tie', chat: localChat };
    }
};

// Обновляем существующую функцию sendUnsyncedMessagesBatch
window.sendUnsyncedMessagesBatch = async function(chatId, messages, topicId, chatTitle, maxContext, userRenamed) {
    if (!window.config.syncEnabled) return { success: true, syncedCount: 0 };
    if (!messages || messages.length === 0) return { success: true, syncedCount: 0 };
    
    // Используем новую функцию с retry
    const result = await window.sendBatchWithRetry(chatId, messages, topicId, chatTitle, maxContext, userRenamed, 3);
    
    if (result.success) {
        window.markMessagesSynced(chatId, result.messageIds);
        return { success: true, syncedCount: result.messageIds.length };
    }
    
    return { success: false, syncedCount: 0, error: result.error };
};

// Загрузка полного чата с сервера с конфликт-резолвингом
window.loadFullChat = async function(chatId) {
    if (!window.config.syncEnabled) return null;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return null;
    
    try {
        const response = await fetch(`/api/chats/get?id=${chatId}`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        
        if (data.success && data.chat && data.messages) {
            const topic = data.chat.topic_id;
            if (!window.chatHistories[topic]) window.chatHistories[topic] = [];
            
            let existingChatIndex = window.chatHistories[topic].findIndex(c => c.id === chatId);
            
            const serverChat = {
                id: data.chat.id,
                title: data.chat.title,
                maxContext: data.chat.max_context,
                userRenamed: data.chat.user_renamed,
                language: window.tg?.initDataUnsafe?.user?.language_code || 'ru',
                topic: topic,
                updated_at: data.chat.updated_at,
                created_at: data.chat.created_at,
                messages: data.messages.map(msg => ({
                    id: msg.id,
                    text: msg.text,
                    type: msg.msg_type,
                    isFavorite: msg.is_favorite,
                    synced: true
                }))
            };
            
            if (existingChatIndex !== -1) {
                const localChat = window.chatHistories[topic][existingChatIndex];
                const resolution = window.resolveChatConflict(localChat, serverChat);
                
                if (resolution.winner === 'server') {
                    window.chatHistories[topic][existingChatIndex] = serverChat;
                    console.log(`🔄 Чат ${chatId}: сервер новее, заменяем локальный`);
                } else if (resolution.winner === 'local') {
                    console.log(`📤 Чат ${chatId}: локально новее, отправляем изменения на сервер`);
                    
                    const localMessages = localChat.messages || [];
                    const serverMessageIds = new Set(serverChat.messages.map(m => m.id));
                    const unsyncedMessages = localMessages.filter(m => !serverMessageIds.has(m.id) && !m.synced);
                    
                    if (unsyncedMessages.length > 0) {
                        const result = await window.sendUnsyncedMessagesBatch(
                            chatId,
                            unsyncedMessages,
                            topic,
                            localChat.title,
                            localChat.maxContext,
                            localChat.userRenamed
                        );
                        
                        if (result.success) {
                            localChat.updated_at = new Date().toISOString();
                            window.chatHistories[topic][existingChatIndex] = localChat;
                            window.saveHistoriesToLocal();
                        } else {
                            console.warn(`⚠️ Частичная синхронизация: отправлено ${result.syncedCount} из ${unsyncedMessages.length} сообщений`);
                        }
                    }
                } else {
                    console.log(`⚖️ Чат ${chatId}: сервер и локально одинаковы`);
                }
            } else {
                window.chatHistories[topic].push(serverChat);
                console.log(`✨ Новый чат ${chatId} загружен с сервера`);
            }
            
            window.saveHistoriesToLocal();
            
            if (window.activeChatIds[topic] === chatId) {
                if (typeof window.loadActiveChatMessages === 'function') {
                    window.loadActiveChatMessages();
                }
            }
            
            return serverChat;
        }
    } catch (err) {
        console.error("Ошибка загрузки чата с сервера:", err);
        return null;
    }
};

// Периодическая проверка и повторная отправка unsynced сообщений
window.startUnsyncedRetryTimer = function() {
    setInterval(async () => {
        if (window.config.syncEnabled && navigator.onLine !== false) {
            if (typeof window.retryUnsyncedMessages === 'function') {
                await window.retryUnsyncedMessages();
            }
            if (typeof window.retryUnsyncedFavorites === 'function') {
                await window.retryUnsyncedFavorites();
            }
            if (typeof window.retryUnsyncedChats === 'function') {
                await window.retryUnsyncedChats();
            }
        }
    }, 30000);
};

// Синхронизация всего чата (если пользователь стал PRO)
window.fullSyncAllChats = async function() {
    if (!window.config.syncEnabled) {
        console.log("Синхронизация отключена, полная синхронизация не требуется");
        return;
    }
    
    console.log("🔄 Начинаем полную синхронизацию всех чатов...");
    
 //   await window.syncChatsMetadata();
    
    const topics = ['code', 'creative', 'fast', 'kitchen'];
    
    for (const topic of topics) {
        const localChats = window.chatHistories[topic] || [];
        const cloudChatIds = new Set(Object.keys(window.cloudChatsMeta || {}));
        
        for (const localChat of localChats) {
            if (cloudChatIds.has(localChat.id)) {
                const cloudMeta = window.cloudChatsMeta[localChat.id];
                if (cloudMeta && new Date(cloudMeta.updated_at) > new Date(localChat.updated_at || localChat.created_at)) {
                    await window.loadFullChat(localChat.id);
                }
            }
        }
    }
    
if (typeof window.processPendingDeletions === 'function') {
    await window.processPendingDeletions();
}
    console.log("✅ Полная синхронизация завершена");
    
    window.startUnsyncedRetryTimer();
};

// ==========================================
// ФУНКЦИЯ СИНХРОНИЗАЦИИ СООБЩЕНИЙ (AI и USER)
// ==========================================

window.syncMessageToCloud = async function(chatId, message) {
    console.log("📤 syncMessageToCloud вызвана", { chatId: chatId, messageId: message?.id, type: message?.type });
    
    if (!window.config.syncEnabled) {
        console.log("Синхронизация отключена, сообщение не отправлено");
        return false;
    }
    
    if (!chatId || !message || !message.id) {
        console.error("Недостаточно данных для синхронизации сообщения");
        return false;
    }
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.error("Нет initData для синхронизации");
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
                action: 'new_message',
                chatId: chatId,
                message: {
                    id: message.id,
                    text: message.text,
                    type: message.type,
                    isFavorite: message.isFavorite || false
                }
            })
        });
        
        const data = await response.json();
        
        if (data.synced === true || data.success === true) {
            console.log(`✅ Сообщение ${message.id} (${message.type}) синхронизировано`);
            if (typeof window.markMessagesSynced === 'function') {
                window.markMessagesSynced(chatId, [message.id]);
            }
            return true;
        } else {
            console.warn(`⚠️ Сообщение ${message.id} не синхронизировано:`, data.error);
            if (typeof window.addToUnsyncedQueue === 'function') {
                window.addToUnsyncedQueue(chatId, message);
            }
            return false;
        }
    } catch (err) {
        console.error(`❌ Ошибка синхронизации:`, err);
        if (typeof window.addToUnsyncedQueue === 'function') {
            window.addToUnsyncedQueue(chatId, message);
        }
        return false;
    }
};

console.log("✅ syncMessageToCloud зарегистрирована в глобальной области, тип:", typeof window.syncMessageToCloud);

// Функция для синхронизации нескольких сообщений разом (batch)
window.syncBatchMessagesToCloud = async function(chatId, messages) {
    if (!window.config.syncEnabled) return false;
    if (!messages || messages.length === 0) return true;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return false;
    
    try {
        const response = await fetch('/api/chats/action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({
                action: 'batch_messages',
                chatId: chatId,
                messages: messages.map(msg => ({
                    id: msg.id,
                    text: msg.text,
                    type: msg.type,
                    isFavorite: msg.isFavorite || false
                }))
            })
        });
        
        const data = await response.json();
        
        if (data.synced === true || data.success === true) {
            console.log(`✅ Batch синхронизация: ${messages.length} сообщений`);
            if (typeof window.markMessagesSynced === 'function') {
                window.markMessagesSynced(chatId, messages.map(m => m.id));
            }
            return true;
        }
        return false;
    } catch (err) {
        console.error("Ошибка batch синхронизации:", err);
        return false;
    }
};
// Загрузка сообщений для всех чатов, которые обновились
window.syncAllUpdatedChats = async function() {
    if (!window.config.syncEnabled) return;
    
    console.log("🔄 Проверяем обновления во всех чатах...");
    
    const topics = ['code', 'creative', 'fast', 'kitchen'];
    let updatedCount = 0;
    
    for (const topic of topics) {
        const localChats = window.chatHistories[topic] || [];
        
        for (const localChat of localChats) {
            const cloudMeta = window.cloudChatsMeta?.[localChat.id];
            
            if (cloudMeta && new Date(cloudMeta.updated_at) > new Date(localChat.updated_at || localChat.created_at)) {
                console.log(`🔄 Загружаем обновления для чата ${localChat.title} (${localChat.id})`);
                await window.loadFullChat(localChat.id);
                updatedCount++;
            }
        }
    }
    
    // Обновляем UI
    if (updatedCount > 0) {
        if (typeof window.loadActiveChatMessages === 'function') {
            window.loadActiveChatMessages();
        }
        if (typeof window.renderHistoryChatsList === 'function') {
            window.renderHistoryChatsList();
        }
    }
    
    console.log(`✅ Проверка завершена, обновлено ${updatedCount} чатов`);
};

// Добавить в конец файла net-sync.js

// Функция отправки с retry
window.sendBatchWithRetry = async function(chatId, messages, topicId, chatTitle, maxContext, userRenamed, retries = 3) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return { success: false, error: 'No init data' };
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({
                    action: 'batch_messages',
                    chatId: chatId,
                    topicId: topicId,
                    chatTitle: chatTitle,
                    maxContext: maxContext,
                    userRenamed: userRenamed,
                    messages: messages.map(msg => ({
                        id: msg.id,
                        text: msg.text,
                        type: msg.type,
                        isFavorite: msg.isFavorite || false
                    }))
                })
            });
            
            const data = await response.json();
            
            if (data.synced === true || data.success === true) {
                console.log(`✅ Batch отправлен (попытка ${attempt})`);
                return { success: true, messageIds: messages.map(m => m.id) };
            }
            
            // Если ошибка не временная (403, 401) — не retry
            if (response.status === 401 || response.status === 403) {
                return { success: false, error: data.error };
            }
            
            // Временная ошибка — продолжаем retry
            if (attempt < retries) {
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.log(`⚠️ Batch не отправился, retry через ${delay}ms (попытка ${attempt}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`❌ Batch не отправился после ${retries} попыток`);
                return { success: false, error: data.error };
            }
            
        } catch (err) {
            if (attempt < retries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`⚠️ Ошибка сети, retry через ${delay}ms (попытка ${attempt}/${retries}):`, err.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`❌ Ошибка сети после ${retries} попыток:`, err);
                return { success: false, error: err.message };
            }
        }
    }
    
    return { success: false, error: 'Max retries exceeded' };
};
// ==========================================
// ФУНКЦИЯ СИНХРОНИЗАЦИИ НОВОГО ЧАТА
// ==========================================

window.syncNewChatToCloud = async function(chat) {
    console.log("📤 syncNewChatToCloud вызвана", chat.id);
    
    if (!window.config.syncEnabled) {
        console.log("Синхронизация отключена");
        return false;
    }
    
    if (!chat || !chat.id) {
        console.error("Нет данных чата");
        return false;
    }
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.error("Нет initData");
        return false;
    }
    
    // Берём первое сообщение (приветствие)
    const firstMessage = chat.messages && chat.messages[0] ? chat.messages[0] : null;
    
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
                    title: chat.title,
                    max_context: chat.maxContext || 15,
                    user_renamed: chat.userRenamed || false
                },
                firstMessage: firstMessage ? {
                    id: firstMessage.id,
                    type: firstMessage.type,
                    text: firstMessage.text,
                    is_favorite: firstMessage.isFavorite || false
                } : null
            })
        });
        
        const data = await response.json();
        console.log('📤 Результат синхронизации чата:', data);
        
        if (data.success) {
            console.log(`✅ Чат ${chat.id} синхронизирован`);
            // Обновляем метаданные
            if (typeof window.syncChatsMetadata === 'function') {
                await window.syncChatsMetadata();
            }
            return true;
        } else {
            console.warn(`⚠️ Чат ${chat.id} не синхронизирован:`, data.error);
            // Добавляем в очередь несинхронизированных чатов
            if (!window.unsyncedChats) window.unsyncedChats = [];
            window.unsyncedChats.push({
                chat: chat,
                timestamp: new Date().toISOString()
            });
            window.saveHistoriesToLocal();
            return false;
        }
    } catch (err) {
        console.error(`❌ Ошибка синхронизации чата:`, err);
        if (!window.unsyncedChats) window.unsyncedChats = [];
        window.unsyncedChats.push({
            chat: chat,
            timestamp: new Date().toISOString()
        });
        window.saveHistoriesToLocal();
        return false;
    }
};

// ==========================================
// ПОВТОРНАЯ СИНХРОНИЗАЦИЯ НЕСИНХРОНИЗИРОВАННЫХ ЧАТОВ
// ==========================================

window.retryUnsyncedChats = async function() {
    if (!window.config.syncEnabled) return;
    if (!window.unsyncedChats || window.unsyncedChats.length === 0) return;
    
    console.log(`🔄 Повторная отправка ${window.unsyncedChats.length} несинхронизированных чатов...`);
    
    const failedAgain = [];
    
    for (const item of window.unsyncedChats) {
        const chat = item.chat;
        const success = await window.syncNewChatToCloud(chat);
        if (!success) {
            failedAgain.push(item);
        }
    }
    
    window.unsyncedChats = failedAgain;
    window.saveHistoriesToLocal();
    
    if (failedAgain.length === 0) {
        console.log("✅ Все чаты успешно синхронизированы!");
    } else {
        console.log(`⚠️ ${failedAgain.length} чатов ожидают повторной синхронизации`);
    }
};

console.log("✅ net-sync.js полностью загружен");
