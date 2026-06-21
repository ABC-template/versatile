// ============================================
// js/services/sync.js
// Описание: Синхронизация и очереди
// ============================================

class SyncService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.syncStore = window.syncStore;
        this.userStore = window.userStore;
        this.chatService = window.chatService;
        this.messageService = window.messageService;
        
        this.isProcessing = false;
        this.retryTimer = null;
    }
    
    // ==========================================
    // ПОЛНАЯ СИНХРОНИЗАЦИЯ
    // ==========================================
    
    async fullSync() {
        if (!this.userStore.canSync()) {
            console.log('Синхронизация отключена');
            return;
        }
        
        if (this.isProcessing) {
            console.log('Синхронизация уже выполняется');
            return;
        }
        
        this.isProcessing = true;
        this.syncStore.startProcessing();
        
        try {
            console.log('🔄 Начинаем полную синхронизацию...');
            
            const metadata = await this.chatService.getMetadata();
            await this.loadAllChats(metadata.chats || []);
            await this.processPendingDeletions();
            await this.retryUnsyncedItems();
            
            console.log('✅ Полная синхронизация завершена');
            
        } catch (err) {
            console.error('Full sync error:', err);
        } finally {
            this.isProcessing = false;
            this.syncStore.stopProcessing();
        }
    }
    
    // ==========================================
    // ЗАГРУЗКА ВСЕХ ЧАТОВ
    // ==========================================
    
    async loadAllChats(cloudChats) {
        if (!cloudChats || cloudChats.length === 0) {
            console.log('Нет чатов в облаке');
            return;
        }
        
        let loadedCount = 0;
        
        for (const cloudChat of cloudChats) {
            const topic = cloudChat.topic_id || 'code';
            const localChats = this.chatStore.getChats(topic);
            const existing = localChats.find(c => c.id === cloudChat.id);
            
            if (existing) {
                const cloudTime = new Date(cloudChat.updated_at);
                const localTime = new Date(existing.updated_at || existing.created_at);
                if (cloudTime > localTime) {
                    const fullChat = await this.chatService.getChat(cloudChat.id);
                    if (fullChat) loadedCount++;
                }
            } else {
                const fullChat = await this.chatService.getChat(cloudChat.id);
                if (fullChat) loadedCount++;
            }
        }
        
        console.log(`✅ Загружено ${loadedCount} чатов`);
        return loadedCount;
    }
    
    // ==========================================
    // ОБРАБОТКА PENDING DELETIONS
    // ==========================================
    
    async processPendingDeletions() {
        if (!this.userStore.canSync()) return;
        
        try {
            const deviceFingerprint = this.userStore.getDeviceFingerprint();
            if (!deviceFingerprint) return;
            
            const data = await this.apiClient.get(`/sync/pending?device=${encodeURIComponent(deviceFingerprint)}`);
            
            if (!data.pending || data.pending.length === 0) return;
            
            console.log(`🗑️ Обработка ${data.pending.length} удаленных элементов...`);
            
            for (const item of data.pending) {
                if (item.entity_type === 'chat') {
                    this.chatStore.deleteChat(item.id);
                } else if (item.entity_type === 'message') {
                    const found = this.chatStore.findChat(item.parent_id);
                    if (found) {
                        this.chatStore.deleteMessage(item.parent_id, item.id);
                    }
                }
                await this.confirmDeletion(item.id, deviceFingerprint);
            }
            
            console.log('✅ Обработка удалений завершена');
            
        } catch (err) {
            console.error('Process pending deletions error:', err);
        }
    }
    
    async confirmDeletion(id, deviceFingerprint) {
        try {
            const data = await this.apiClient.post('/sync/confirm', {
                id: id,
                deviceFingerprint: deviceFingerprint
            });
            return data.success === true;
        } catch (err) {
            console.error('Confirm deletion error:', err);
            return false;
        }
    }
    
    // ==========================================
    // ПОВТОРНАЯ ОТПРАВКА НЕСИНХРОНИЗИРОВАННЫХ
    // ==========================================
    
    async retryUnsyncedItems() {
        if (!this.userStore.canSync()) return;
        await this.retryUnsyncedMessages();
        await this.retryUnsyncedFavorites();
        await this.retryUnsyncedChats();
    }
    
    async retryUnsyncedMessages() {
        const items = this.syncStore.unsyncedMessages;
        if (items.length === 0) return;
        
        console.log(`🔄 Повторная отправка ${items.length} несинхронизированных сообщений...`);
        
        const grouped = {};
        for (const item of items) {
            if (!grouped[item.chatId]) {
                grouped[item.chatId] = [];
            }
            grouped[item.chatId].push(item);
        }
        
        const failedAgain = [];
        
        for (const [chatId, chatItems] of Object.entries(grouped)) {
            const found = this.chatStore.findChat(chatId);
            if (!found || !found.chat) {
                console.warn(`⚠️ Чат ${chatId} не найден локально, пропускаем`);
                continue;
            }
            
            const chat = found.chat;
            
            if (!this.chatStore.hasRealMessages(chat)) {
                console.warn(`⚠️ Чат ${chatId} пустой, удаляем из очереди`);
                const ids = chatItems.map(item => item.message.id);
                this.chatStore.markMessagesSynced(chatId, ids);
                continue;
            }
            
            if (!chat.synced) {
                console.log(`📤 Создаем чат ${chatId} с первым сообщением...`);
                const firstMessage = chatItems[0].message;
                const created = await this.chatService.createChat(
                    chat.topic,
                    chat.title,
                    {
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed,
                        firstMessage: firstMessage
                    }
                );
                
                if (created) {
                    const ids = chatItems.map(item => item.message.id);
                    this.chatStore.markMessagesSynced(chatId, ids);
                    console.log(`✅ Чат ${chatId} и ${ids.length} сообщений синхронизированы`);
                    continue;
                } else {
                    for (const item of chatItems) {
                        item.attempts = (item.attempts || 0) + 1;
                        if (item.attempts < 5) {
                            failedAgain.push(item);
                        }
                    }
                    continue;
                }
            }
            
            if (chatItems.length > 1) {
                try {
                    const messages = chatItems.map(item => item.message);
                    const result = await this.messageService.sendBatch(chatId, messages, {
                        topicId: chat.topic,
                        chatTitle: chat.title,
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed
                    });
                    
                    if (result && result.success) {
                        const ids = messages.map(m => m.id);
                        this.chatStore.markMessagesSynced(chatId, ids);
                        console.log(`✅ Пакет ${messages.length} сообщений синхронизирован`);
                        continue;
                    }
                } catch (err) {
                    console.error('Batch send error:', err);
                }
            }
            
            for (const item of chatItems) {
                try {
                    const data = await this.apiClient.post('/chats/actions/message', {
                        action: 'new_message',
                        chatId: chatId,
                        message: item.message
                    });
                    
                    if (data.synced || data.success) {
                        this.chatStore.markMessagesSynced(chatId, [item.message.id]);
                        console.log(`✅ Сообщение ${item.message.id} синхронизировано`);
                    } else {
                        item.attempts = (item.attempts || 0) + 1;
                        if (item.attempts < 5) {
                            failedAgain.push(item);
                        }
                    }
                } catch (err) {
                    console.error('Retry message error:', err);
                    item.attempts = (item.attempts || 0) + 1;
                    if (item.attempts < 5) {
                        failedAgain.push(item);
                    }
                }
            }
        }
        
        this.syncStore.unsyncedMessages = failedAgain;
        this.syncStore.saveToStorage();
    }
    
    async retryUnsyncedFavorites() {
        const items = this.syncStore.unsyncedFavorites;
        if (items.length === 0) return;
        
        console.log(`🔄 Повторная отправка ${items.length} несинхронизированных избранных...`);
        
        const failedAgain = [];
        
        for (const item of items) {
            try {
                const data = await this.apiClient.post('/chats/actions/favorite', {
                    action: 'favorite_message',
                    chatId: item.chatId,
                    messageId: item.messageId,
                    isFavorite: item.isFavorite
                });
                
                if (!data.success) {
                    item.attempts = (item.attempts || 0) + 1;
                    if (item.attempts < 5) {
                        failedAgain.push(item);
                    }
                }
            } catch (err) {
                console.error('Retry favorite error:', err);
                item.attempts = (item.attempts || 0) + 1;
                if (item.attempts < 5) {
                    failedAgain.push(item);
                }
            }
        }
        
        this.syncStore.unsyncedFavorites = failedAgain;
        this.syncStore.saveToStorage();
    }
    
    async retryUnsyncedChats() {
        const items = this.syncStore.unsyncedChats;
        if (items.length === 0) return;
        
        console.log(`🔄 Повторная отправка ${items.length} несинхронизированных чатов...`);
        
        const failedAgain = [];
        
        for (const item of items) {
            const chat = item.chat;
            const created = await this.chatService.createChat(chat.topic, chat.title, {
                maxContext: chat.maxContext,
                userRenamed: chat.userRenamed,
                firstMessage: chat.messages?.[0] || null
            });
            
            if (created) {
                console.log(`✅ Чат ${chat.id} синхронизирован`);
            } else {
                item.attempts = (item.attempts || 0) + 1;
                if (item.attempts < 5) {
                    failedAgain.push(item);
                }
            }
        }
        
        this.syncStore.unsyncedChats = failedAgain;
        this.syncStore.saveToStorage();
    }
    
    // ==========================================
    // ЗАПУСК ПЕРИОДИЧЕСКОЙ СИНХРОНИЗАЦИИ
    // ==========================================
    
    startPeriodicSync() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
        }
        
        this.retryTimer = setInterval(() => {
            if (this.userStore.canSync() && navigator.onLine) {
                this.retryUnsyncedItems();
            }
        }, 30000);
        
        console.log('⏰ Периодическая синхронизация запущена');
    }
    
    stopPeriodicSync() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }
}

window.SyncService = SyncService;
window.syncService = new SyncService();

console.log('✅ SyncService загружен');
