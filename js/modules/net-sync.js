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
            
            // Обновляем метаданные с учетом updated_at
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
    
    // Лимиты для батча: 50 сообщений или 1MB
    const BATCH_SIZE_LIMIT = 50;
    const BATCH_BYTES_LIMIT = 1000000; // 1MB
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return { success: false, error: 'No init data' };
    
    let syncedCount = 0;
    let currentBatch = [];
    let currentBatchSize = 0;
    
    // Функция отправки одного батча
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
    
    // Разбиваем сообщения на батчи
    for (const msg of messages) {
        const msgSize = new TextEncoder().encode(JSON.stringify(msg)).length;
        
        if (currentBatch.length >= BATCH_SIZE_LIMIT || 
            (currentBatchSize + msgSize) >= BATCH_BYTES_LIMIT) {
            
            if (currentBatch.length > 0) {
                const result = await sendBatch(currentBatch);
                if (result.success) {
                    syncedCount += currentBatch.length;
                    // Помечаем сообщения как синхронизированные
                    window.markMessagesSynced(chatId, result.messageIds);
                } else {
                    console.error("Батч не отправлен:", result.error);
                    // Возвращаем частичный успех
                    return { success: false, syncedCount: syncedCount, error: result.error };
                }
            }
            
            currentBatch = [];
            currentBatchSize = 0;
        }
        
        currentBatch.push(msg);
        currentBatchSize += msgSize;
    }
    
    // Отправляем последний батч
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
            
            // Формируем серверный чат
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
                    synced: true // Сообщения с сервера считаем синхронизированными
                }))
            };
            
            // Конфликт-резолвинг
            if (existingChatIndex !== -1) {
                const localChat = window.chatHistories[topic][existingChatIndex];
                const resolution = window.resolveChatConflict(localChat, serverChat);
                
                if (resolution.winner === 'server') {
                    // Сервер новее → заменяем локальный чат
                    window.chatHistories[topic][existingChatIndex] = serverChat;
                    console.log(`🔄 Чат ${chatId}: сервер новее, заменяем локальный`);
                } else if (resolution.winner === 'local') {
                    // Локально новее → отправляем только новые сообщения на сервер
                    console.log(`📤 Чат ${chatId}: локально новее, отправляем изменения на сервер`);
                    
                    // Находим сообщения, которых нет на сервере (local.synced === false)
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
                            // После успешной отправки обновляем updated_at локального чата
                            localChat.updated_at = new Date().toISOString();
                            window.chatHistories[topic][existingChatIndex] = localChat;
                            window.saveHistoriesToLocal();
                        } else {
                            console.warn(`⚠️ Частичная синхронизация: отправлено ${result.syncedCount} из ${unsyncedMessages.length} сообщений`);
                        }
                    }
                    
                    // Не заменяем локальный чат, просто оставляем как есть
                } else {
                    // Равны (tie) → ничего не делаем
                    console.log(`⚖️ Чат ${chatId}: сервер и локально одинаковы`);
                }
            } else {
                // Новый чат, которого нет локально → добавляем
                window.chatHistories[topic].push(serverChat);
                console.log(`✨ Новый чат ${chatId} загружен с сервера`);
            }
            
            window.saveHistoriesToLocal();
            
            // Если активный чат совпадает, обновляем интерфейс
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
    // Проверяем каждые 30 секунд
    setInterval(async () => {
        if (window.config.syncEnabled && navigator.onLine !== false) {
            if (typeof window.retryUnsyncedMessages === 'function') {
                await window.retryUnsyncedMessages();
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
    
    // Сначала синхронизируем метаданные
    await window.syncChatsMetadata();
    
    // Загружаем все чаты, которых нет локально или которые устарели
    const topics = ['code', 'creative', 'fast', 'kitchen'];
    
    for (const topic of topics) {
        const localChats = window.chatHistories[topic] || [];
        const cloudChatIds = new Set(Object.keys(window.cloudChatsMeta || {}));
        
        for (const localChat of localChats) {
            if (cloudChatIds.has(localChat.id)) {
                // Чат есть в облаке, проверяем актуальность
                const cloudMeta = window.cloudChatsMeta[localChat.id];
                if (cloudMeta && new Date(cloudMeta.updated_at) > new Date(localChat.updated_at || localChat.created_at)) {
                    // Облачный чат новее → загружаем полностью
                    await window.loadFullChat(localChat.id);
                }
            }
            // Если чата нет в облаке, но syncEnabled=true, он создастся при первом сообщении
        }
    }
    
    console.log("✅ Полная синхронизация завершена");
    
    // Запускаем retry-таймер для unsynced сообщений
    window.startUnsyncedRetryTimer();
};
