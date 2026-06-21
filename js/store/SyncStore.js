// ============================================
// js/store/SyncStore.js
// Описание: Синхронизация и очереди
// ✅ ИСПРАВЛЕНО: добавлена очередь удалений
// ✅ ИСПРАВЛЕНО: методы для работы с удалениями
// ============================================

class SyncStore {
    constructor() {
        this.unsyncedMessages = [];
        this.unsyncedFavorites = [];
        this.unsyncedChats = [];
        this.unsyncedDeletions = []; // ✅ НОВАЯ ОЧЕРЕДЬ ДЛЯ УДАЛЕНИЙ
        this.offlineQueue = [];
        this.pendingDeletions = [];
        
        this.isProcessing = false;
        this.retryTimer = null;
        
        this.loadFromStorage();
    }
    
    // ==========================================
    // ЗАГРУЗКА / СОХРАНЕНИЕ
    // ==========================================
    
    getUserId() {
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        return user?.id || 'anonymous';
    }
    
    loadFromStorage() {
        const userId = this.getUserId();
        const prefix = `sync_${userId}`;
        
        try {
            this.unsyncedMessages = JSON.parse(localStorage.getItem(`${prefix}_messages`) || '[]');
            this.unsyncedFavorites = JSON.parse(localStorage.getItem(`${prefix}_favorites`) || '[]');
            this.unsyncedChats = JSON.parse(localStorage.getItem(`${prefix}_chats`) || '[]');
            this.unsyncedDeletions = JSON.parse(localStorage.getItem(`${prefix}_deletions`) || '[]'); // ✅ НОВОЕ
            this.offlineQueue = JSON.parse(localStorage.getItem(`${prefix}_offline`) || '[]');
            this.pendingDeletions = JSON.parse(localStorage.getItem(`${prefix}_pending`) || '[]');
        } catch (e) {
            console.error('Ошибка загрузки SyncStore:', e);
        }
    }
    
    saveToStorage() {
        const userId = this.getUserId();
        const prefix = `sync_${userId}`;
        
        try {
            localStorage.setItem(`${prefix}_messages`, JSON.stringify(this.unsyncedMessages));
            localStorage.setItem(`${prefix}_favorites`, JSON.stringify(this.unsyncedFavorites));
            localStorage.setItem(`${prefix}_chats`, JSON.stringify(this.unsyncedChats));
            localStorage.setItem(`${prefix}_deletions`, JSON.stringify(this.unsyncedDeletions)); // ✅ НОВОЕ
            localStorage.setItem(`${prefix}_offline`, JSON.stringify(this.offlineQueue));
            localStorage.setItem(`${prefix}_pending`, JSON.stringify(this.pendingDeletions));
        } catch (e) {
            console.error('Ошибка сохранения SyncStore:', e);
        }
    }
    
    // ==========================================
    // ОЧЕРЕДЬ СООБЩЕНИЙ
    // ==========================================
    
    addUnsyncedMessage(chatId, message, topicId, chatTitle, maxContext, userRenamed) {
        const exists = this.unsyncedMessages.some(
            item => item.chatId === chatId && item.message.id === message.id
        );
        
        if (exists) {
            console.log(`⏳ Сообщение ${message.id} уже в очереди, пропускаем`);
            return;
        }
        
        this.unsyncedMessages.push({
            chatId,
            message,
            topicId,
            chatTitle,
            maxContext,
            userRenamed,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
        console.log(`📤 Сообщение ${message.id} добавлено в очередь синхронизации`);
    }
    
    // ✅ НОВАЯ ФУНКЦИЯ: Очередь удалений
    addUnsyncedDeletion(chatId, messageId) {
        const exists = this.unsyncedDeletions.some(
            item => item.chatId === chatId && item.messageId === messageId
        );
        
        if (exists) {
            console.log(`⏳ Удаление ${messageId} уже в очереди, пропускаем`);
            return;
        }
        
        this.unsyncedDeletions.push({
            chatId,
            messageId,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
        console.log(`🗑️ Удаление сообщения ${messageId} добавлено в очередь`);
    }
    
    // ✅ НОВАЯ ФУНКЦИЯ: Удаление из очереди удалений
    removeUnsyncedDeletion(chatId, messageId) {
        const removed = [];
        this.unsyncedDeletions = this.unsyncedDeletions.filter(item => {
            if (item.chatId === chatId && item.messageId === messageId) {
                removed.push(messageId);
                return false;
            }
            return true;
        });
        
        if (removed.length > 0) {
            this.saveToStorage();
            console.log(`✅ Удаление ${removed.join(', ')} убрано из очереди`);
        }
    }
    
    addUnsyncedFavorite(messageId, chatId, isFavorite) {
        const exists = this.unsyncedFavorites.some(
            item => item.messageId === messageId && item.chatId === chatId
        );
        
        if (exists) {
            console.log(`⏳ Избранное ${messageId} уже в очереди, пропускаем`);
            return;
        }
        
        this.unsyncedFavorites.push({
            messageId,
            chatId,
            isFavorite,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
    }
    
    addUnsyncedChat(chat) {
        const exists = this.unsyncedChats.some(
            item => item.chat.id === chat.id
        );
        
        if (exists) {
            console.log(`⏳ Чат ${chat.id} уже в очереди, пропускаем`);
            return;
        }
        
        this.unsyncedChats.push({
            chat,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
    }
    
    markMessagesSynced(chatId, messageIds) {
        const removed = [];
        this.unsyncedMessages = this.unsyncedMessages.filter(item => {
            if (item.chatId === chatId && messageIds.includes(item.message.id)) {
                removed.push(item.message.id);
                return false;
            }
            return true;
        });
        
        if (removed.length > 0) {
            this.saveToStorage();
            console.log(`✅ Сообщения ${removed.join(', ')} удалены из очереди синхронизации`);
        }
    }
    
    markChatSynced(chatId) {
        this.unsyncedChats = this.unsyncedChats.filter(item => 
            item.chat.id !== chatId
        );
        this.saveToStorage();
    }
    
    getUnsyncedCount() {
        return this.unsyncedMessages.length + 
               this.unsyncedFavorites.length + 
               this.unsyncedChats.length +
               this.unsyncedDeletions.length; // ✅ УЧИТЫВАЕМ УДАЛЕНИЯ
    }
    
    // ==========================================
    // ОФЛАЙН-ОЧЕРЕДЬ
    // ==========================================
    
    addOfflineItem(chatId, message, topicId) {
        const exists = this.offlineQueue.some(
            item => item.chatId === chatId && item.message.id === message.id
        );
        
        if (exists) {
            console.log(`⏳ Офлайн-сообщение ${message.id} уже в очереди, пропускаем`);
            return;
        }
        
        this.offlineQueue.push({
            chatId,
            message,
            topicId,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
    }
    
    removeOfflineItem(index) {
        this.offlineQueue.splice(index, 1);
        this.saveToStorage();
    }
    
    getOfflineCount() {
        return this.offlineQueue.length;
    }
    
    // ==========================================
    // PENDING DELETIONS
    // ==========================================
    
    addPendingDeletion(id, entityType, parentId) {
        const exists = this.pendingDeletions.some(
            item => item.id === id
        );
        
        if (exists) {
            console.log(`⏳ Удаление ${id} уже в очереди, пропускаем`);
            return;
        }
        
        this.pendingDeletions.push({
            id,
            entity_type: entityType,
            parent_id: parentId,
            timestamp: new Date().toISOString()
        });
        this.saveToStorage();
    }
    
    removePendingDeletion(id) {
        this.pendingDeletions = this.pendingDeletions.filter(item => item.id !== id);
        this.saveToStorage();
    }
    
    getPendingDeletions() {
        return this.pendingDeletions;
    }
    
    // ==========================================
    // СТАТУСЫ
    // ==========================================
    
    startProcessing() {
        this.isProcessing = true;
    }
    
    stopProcessing() {
        this.isProcessing = false;
    }
    
    isProcessingSync() {
        return this.isProcessing;
    }
    
    // ==========================================
    // ОЧИСТКА
    // ==========================================
    
    clearAll() {
        this.unsyncedMessages = [];
        this.unsyncedFavorites = [];
        this.unsyncedChats = [];
        this.unsyncedDeletions = []; // ✅ НОВОЕ
        this.offlineQueue = [];
        this.pendingDeletions = [];
        this.saveToStorage();
    }
}

window.SyncStore = SyncStore;
window.syncStore = new SyncStore();

console.log('✅ SyncStore загружен');
