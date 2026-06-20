// ============================================
// js/modules/sync/queue-manager.js
// Описание: Единая очередь синхронизации
// ============================================

class QueueManager {
    constructor() {
        this.syncStore = window.syncStore;
        this.userStore = window.userStore;
        this.chatStore = window.chatStore;
        this.isProcessing = false;
        this.processingInterval = null;
    }
    
    // ==========================================
    // ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
    // ==========================================
    
    /**
     * Добавить действие в очередь
     * @param {string} action - Тип действия
     * @param {object} data - Данные действия
     */
    add(action, data) {
        const queueItem = {
            action: action,
            data: data,
            timestamp: Date.now(),
            attempts: 0
        };
        
        // Определяем тип очереди
        switch (action) {
            case 'create_chat':
                this.syncStore.unsyncedChats.push(queueItem);
                break;
            case 'add_message':
            case 'delete_message':
                this.syncStore.unsyncedMessages.push(queueItem);
                break;
            case 'toggle_favorite':
                this.syncStore.unsyncedFavorites.push(queueItem);
                break;
            default:
                console.warn('Неизвестное действие:', action);
                return;
        }
        
        this.syncStore.saveToStorage();
        this.process();
    }
    
    /**
     * Добавить сообщение в офлайн-очередь
     */
    addOffline(chatId, message, topicId) {
        this.syncStore.addOfflineItem(chatId, message, topicId);
        this.processOffline();
    }
    
    // ==========================================
    // ОБРАБОТКА ОЧЕРЕДИ
    // ==========================================
    
    /**
     * Обработка основной очереди
     */
    async process() {
        if (this.isProcessing) return;
        if (!this.userStore.canSync()) return;
        if (!navigator.onLine) return;
        
        this.isProcessing = true;
        console.log('🔄 Обработка очереди синхронизации...');
        
        try {
            // Обрабатываем чаты
            await this.processChats();
            
            // Обрабатываем сообщения
            await this.processMessages();
            
            // Обрабатываем избранное
            await this.processFavorites();
            
            // Обрабатываем офлайн-очередь
            await this.processOffline();
            
        } catch (err) {
            console.error('Ошибка обработки очереди:', err);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Обработка чатов
     */
    async processChats() {
        const items = this.syncStore.unsyncedChats;
        if (items.length === 0) return;
        
        const failed = [];
        
        for (const item of items) {
            try {
                const chat = item.data;
                const result = await window.chatService?.createChat(
                    chat.topic,
                    chat.title,
                    {
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed,
                        firstMessage: chat.messages?.[0] || null
                    }
                );
                
                if (result) {
                    console.log(`✅ Чат ${chat.id} синхронизирован`);
                } else {
                    item.attempts++;
                    if (item.attempts < 5) {
                        failed.push(item);
                    }
                }
            } catch (err) {
                console.error('Ошибка синхронизации чата:', err);
                item.attempts++;
                if (item.attempts < 5) {
                    failed.push(item);
                }
            }
        }
        
        this.syncStore.unsyncedChats = failed;
        this.syncStore.saveToStorage();
    }
    
    /**
     * Обработка сообщений
     */
    async processMessages() {
        const items = this.syncStore.unsyncedMessages;
        if (items.length === 0) return;
        
        const failed = [];
        
        for (const item of items) {
            try {
                const { chatId, message } = item.data;
                
                const result = await window.messageService?.sendMessage(
                    chatId,
                    message.text,
                    message.type,
                    {
                        id: message.id,
                        isFavorite: message.isFavorite || false
                    }
                );
                
                if (result) {
                    console.log(`✅ Сообщение ${message.id} синхронизировано`);
                } else {
                    item.attempts++;
                    if (item.attempts < 5) {
                        failed.push(item);
                    }
                }
            } catch (err) {
                console.error('Ошибка синхронизации сообщения:', err);
                item.attempts++;
                if (item.attempts < 5) {
                    failed.push(item);
                }
            }
        }
        
        this.syncStore.unsyncedMessages = failed;
        this.syncStore.saveToStorage();
    }
    
    /**
     * Обработка избранного
     */
    async processFavorites() {
        const items = this.syncStore.unsyncedFavorites;
        if (items.length === 0) return;
        
        const failed = [];
        
        for (const item of items) {
            try {
                const { chatId, messageId, isFavorite } = item.data;
                
                const result = await window.messageService?.toggleFavorite(chatId, messageId);
                
                if (result) {
                    console.log(`✅ Избранное ${messageId} синхронизировано`);
                } else {
                    item.attempts++;
                    if (item.attempts < 5) {
                        failed.push(item);
                    }
                }
            } catch (err) {
                console.error('Ошибка синхронизации избранного:', err);
                item.attempts++;
                if (item.attempts < 5) {
                    failed.push(item);
                }
            }
        }
        
        this.syncStore.unsyncedFavorites = failed;
        this.syncStore.saveToStorage();
    }
    
    /**
     * Обработка офлайн-очереди
     */
    async processOffline() {
        const items = this.syncStore.offlineQueue;
        if (items.length === 0) return;
        if (!navigator.onLine) return;
        
        console.log(`📤 Обработка ${items.length} сообщений из офлайн-очереди...`);
        
        const failed = [];
        
        for (const item of items) {
            try {
                item.attempts++;
                
                const result = await window.messageService?.sendMessage(
                    item.chatId,
                    item.message.text,
                    item.message.type,
                    {
                        id: item.message.id,
                        isFavorite: item.message.isFavorite || false
                    }
                );
                
                if (result) {
                    console.log(`✅ Сообщение из офлайн-очереди отправлено: ${item.message.id}`);
                } else {
                    if (item.attempts < 5) {
                        failed.push(item);
                    }
                }
            } catch (err) {
                console.error('Ошибка обработки офлайн-очереди:', err);
                if (item.attempts < 5) {
                    failed.push(item);
                }
            }
        }
        
        this.syncStore.offlineQueue = failed;
        this.syncStore.saveToStorage();
        
        if (failed.length === 0) {
            console.log('✅ Офлайн-очередь полностью обработана');
        } else {
            console.log(`⏳ ${failed.length} сообщений ожидают повторной попытки`);
        }
    }
    
    // ==========================================
    // ЗАПУСК ПЕРИОДИЧЕСКОЙ ОБРАБОТКИ
    // ==========================================
    
    start() {
        if (this.processingInterval) return;
        
        // Обработка каждые 30 секунд
        this.processingInterval = setInterval(() => {
            if (navigator.onLine && this.userStore.canSync()) {
                this.process();
            }
        }, 30000);
        
        // Обработка при восстановлении сети
        window.addEventListener('online', () => {
            setTimeout(() => this.process(), 2000);
        });
        
        console.log('🔄 QueueManager запущен');
    }
    
    stop() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        console.log('⏹️ QueueManager остановлен');
    }
    
    /**
     * Получить размер очереди
     */
    getQueueSize() {
        return this.syncStore.unsyncedMessages.length +
               this.syncStore.unsyncedFavorites.length +
               this.syncStore.unsyncedChats.length +
               this.syncStore.offlineQueue.length;
    }
    
    /**
     * Очистить очередь
     */
    clear() {
        this.syncStore.clearAll();
        console.log('🧹 Очередь очищена');
    }
}

// Экспортируем как глобальный объект
window.QueueManager = QueueManager;
window.queueManager = new QueueManager();

console.log('✅ QueueManager загружен');
