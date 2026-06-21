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
            
            // 1. Синхронизируем метаданные
            const metadata = await this.chatService.getMetadata();
            
            // 2. Загружаем все чаты
            await this.loadAllChats(metadata.chats || []);
            
            // 3. Обрабатываем отложенные удаления
            await this.processPendingDeletions();
            
            // 4. Отправляем несинхронизированные сообщения
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
            
            // Проверяем, нужно ли обновлять
            if (existing) {
                const cloudTime = new Date(cloudChat.updated_at);
                const localTime = new Date(existing.updated_at || existing.created_at);
                
                if (cloudTime > localTime) {
                    // Загружаем полный чат
                    const fullChat = await this.chatService.getChat(cloudChat.id);
                    if (fullChat) loadedCount++;
                }
            } else {
                // Новый чат
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
                // Удаляем локально
                if (item.entity_type === 'chat') {
                    this.chatStore.deleteChat(item.id);
                } else if (item.entity_type === 'message') {
                    // Находим чат по parent_id
                    const found = this.chatStore.findChat(item.parent_id);
                    if (found) {
                        this.chatStore.deleteMessage(item.parent_id, item.id);
                    }
                }
                
                // Подтверждаем на сервере
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
        
        // Сообщения
        await this.retryUnsyncedMessages();
        
        // Избранное
        await this.retryUnsyncedFavorites();
        
        // Чаты
        await this.retryUnsyncedChats();
    }
    
async retryUnsyncedMessages() {
    const items = this.syncStore.unsyncedMessages;
    if (items.length === 0) return;
    
    console.log(`🔄 Повторная отправка ${items.length} несинхронизированных сообщений...`);
    
    const failedAgain = [];
    
    for (const item of items) {
        try {
            // Проверяем, существует ли чат
            const found = this.chatStore.findChat(item.chatId);
            if (!found || !found.chat) {
                console.warn(`⚠️ Чат ${item.chatId} не найден локально, пропускаем`);
                continue;
            }
            
            // Если чат не синхронизирован — создаем его
            if (!found.chat.synced) {
                console.log(`📤 Создаем чат ${item.chatId} перед отправкой сообщения...`);
                const created = await this.chatService.createChat(
                    found.chat.topic,
                    found.chat.title,
                    {
                        maxContext: found.chat.maxContext,
                        userRenamed: found.chat.userRenamed,
                        firstMessage: item.message
                    }
                );
                if (created) {
                    this.chatStore.markMessagesSynced(item.chatId, [item.message.id]);
                    console.log(`✅ Сообщение ${item.message.id} синхронизировано через создание чата`);
                    continue;
                }
            }
            
            const data = await this.apiClient.post('/chats/actions/message', {
                action: 'new_message',
                chatId: item.chatId,
                message: item.message
            });
            
            if (data.synced || data.success) {
                this.chatStore.markMessagesSynced(item.chatId, [item.message.id]);
            } else if (data.error && data.error.includes('Chat not found')) {
                // Если чат не найден в облаке — помечаем как unsynced и попробуем позже
                console.warn(`⚠️ Чат ${item.chatId} не найден в облаке, будет попытка позже`);
                item.attempts = (item.attempts || 0) + 1;
                if (item.attempts < 5) {
                    failedAgain.push(item);
                }
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
                // Успешно создан
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
        }, 30000); // Каждые 30 секунд
        
        console.log('⏰ Периодическая синхронизация запущена');
    }
    
    stopPeriodicSync() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }
}

// Экспортируем как глобальный объект
window.SyncService = SyncService;
window.syncService = new SyncService();

console.log('✅ SyncService загружен');
