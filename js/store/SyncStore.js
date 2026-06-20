// ============================================
// js/store/SyncStore.js
// Описание: Синхронизация и очереди
// ============================================

class SyncStore {
    constructor() {
        this.unsyncedMessages = [];
        this.unsyncedFavorites = [];
        this.unsyncedChats = [];
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
    }
    
    addUnsyncedFavorite(messageId, chatId, isFavorite) {
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
        this.unsyncedChats.push({
            chat,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        this.saveToStorage();
    }
    
    markMessagesSynced(chatId, messageIds) {
        this.unsyncedMessages = this.unsyncedMessages.filter(item => 
            item.chatId !== chatId || !messageIds.includes(item.message.id)
        );
        this.saveToStorage();
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
               this.unsyncedChats.length;
    }
    
    // ==========================================
    // ОФЛАЙН-ОЧЕРЕДЬ
    // ==========================================
    
    addOfflineItem(chatId, message, topicId) {
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
        this.offlineQueue = [];
        this.pendingDeletions = [];
        this.saveToStorage();
    }
}

// Экспортируем как глобальный объект
window.SyncStore = SyncStore;
window.syncStore = new SyncStore();

console.log('✅ SyncStore загружен');
