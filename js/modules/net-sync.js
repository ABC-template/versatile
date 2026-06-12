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

// Отправка батча новых сообщений на сервер (только unsynced)
window.sendUnsyncedMessagesBatch = async function(chatId, messages, topicId, chatTitle, maxContext, userRenamed) {
    if (!window.config.syncEnabled) return { success: true, syncedCount: 0 };
    if (!messages || messages.length === 0) return { success: true, syncedCount: 0 };
    
    const BATCH_SIZE_LIMIT = 50;
    const BATCH_BYTES_LIMIT = 1000000;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return { success: false, error: 'No init data' };
    
    let syncedCount = 0;
    let currentBatch = [];
    let currentBatchSize = 0;
    
    const sendBatch = async (batch) => {
        const payload = {
            action: 'batch_messages',
            chatId: chatId,
            topicId: topicId,
            chatTitle: chatTitle,
            maxContext: maxContext,
            userRenamed: userRenamed,
            messages: batch.map(msg => ({
                id: msg.id,
                text: msg.text,
                type: msg.type,
                isFavorite: msg.isFavorite || false
            }))
        };
        
        try {
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (data.synced === true || data.success === true) {
                return { success: true, messageIds: batch.map(m => m.id) };
            } else {
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error("Ошибка отправки батча:", err);
            return { success: false, error: err.message };
        }
    };
    
    for (const msg of messages) {
        const msgSize = new TextEncoder().encode(JSON.stringify(msg)).length;
        
        if (currentBatch.length >= BATCH_SIZE_LIMIT || 
            (currentBatchSize + msgSize) >= BATCH_BYTES_LIMIT) {
            
            if (currentBatch.length > 0) {
                const result = await sendBatch(currentBatch);
                if (result.success) {
                    syncedCount += currentBatch.length;
                    window.markMessagesSynced(chatId, result.messageIds);
                } else {
                    console.error("Батч не отправлен:", result.error);
                    return { success: false, syncedCount: syncedCount, error: result.error };
                }
            }
            
            currentBatch = [];
            currentBatchSize = 0;
        }
        
        currentBatch.push(msg);
        currentBatchSize += msgSize;
    }
    
    if (currentBatch.length > 0) {
        const result = await sendBatch(currentBatch);
        if (result.success) {
            syncedCount += currentBatch.length;
            window.markMessagesSynced(chatId, result.messageIds);
        } else {
            console.error("Финальный батч не отправлен:", result.error);
            return { success: false, syncedCount: syncedCount, error: result.error };
        }
    }
    
    return { success: true, syncedCount: syncedCount };
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

console.log("✅ net-sync.js полностью загружен");
