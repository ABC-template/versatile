// ============================================
// js/services/chats.js
// Описание: CRUD операции с чатами (с версионностью)
// Версия: 2.0.0
// ============================================

class ChatService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // ЗАГРУЗКА МЕТАДАННЫХ (ТОЛЬКО ВЕРСИИ)
    // ==========================================
    
    async loadMetadata() {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена, метаданные не загружаются');
            return;
        }
        
        try {
            console.log('📋 Загрузка метаданных чатов...');
            const data = await this.apiClient.get('/chats/metadata');
            
            if (data.chats && Array.isArray(data.chats)) {
                this.chatStore.updateMetadata(data.chats);
                console.log(`✅ Загружено ${data.chats.length} метаданных чатов`);
            }
            
            return data;
        } catch (err) {
            console.error('❌ Ошибка загрузки метаданных:', err);
            return null;
        }
    }
    
    // ==========================================
    // ПОЛУЧЕНИЕ ВЕРСИИ ЧАТА
    // ==========================================
    
    async getVersion(chatId) {
        try {
            const data = await this.apiClient.get(`/chats/${chatId}/version`);
            return data.version || null;
        } catch (err) {
            console.error(`❌ Ошибка получения версии чата ${chatId}:`, err);
            return null;
        }
    }
    
    // ==========================================
    // ОТКРЫТИЕ ЧАТА (С ПРОВЕРКОЙ ВЕРСИИ)
    // ==========================================
    
    async openChat(chatId) {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return false;
        }
        
        try {
            const localVersion = this.chatStore.getVersion(chatId);
            
            // Запрашиваем чат только если версия отличается
            const url = localVersion 
                ? `/chats/get?id=${chatId}&version=${encodeURIComponent(localVersion)}`
                : `/chats/get?id=${chatId}`;
            
            const data = await this.apiClient.get(url);
            
            // 304 Not Modified - версия актуальна
            if (data.cached && data.status === 304) {
                console.log(`✅ Чат ${chatId} актуален (v${localVersion})`);
                return false;
            }
            
            if (data.success && data.chat) {
                const syncedChat = this.chatStore.syncFromCloud(
                    {
                        ...data.chat,
                        messages: data.messages || []
                    },
                    data.chat.topic_id
                );
                
                // Обновляем версию
                if (data.chat.version) {
                    this.chatStore.setVersion(chatId, data.chat.version);
                }
                
                console.log(`✅ Чат ${chatId} обновлён (v${data.chat.version})`);
                return true;
            }
            
            return false;
        } catch (err) {
            console.error(`❌ Ошибка открытия чата ${chatId}:`, err);
            return false;
        }
    }
    
    // ==========================================
    // ПОЛУЧЕНИЕ ПОЛНОГО ЧАТА (ПРИНУДИТЕЛЬНО)
    // ==========================================
    
    async getChat(chatId) {
        try {
            const data = await this.apiClient.get(`/chats/get?id=${chatId}`);
            
            if (data.success && data.chat) {
                const syncedChat = this.chatStore.syncFromCloud(
                    {
                        ...data.chat,
                        messages: data.messages || []
                    },
                    data.chat.topic_id
                );
                
                if (data.chat.version) {
                    this.chatStore.setVersion(chatId, data.chat.version);
                }
                
                return syncedChat;
            }
            return null;
        } catch (err) {
            console.error(`❌ Ошибка получения чата ${chatId}:`, err);
            return null;
        }
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ ЧАТА
    // ==========================================
    
    async updateChat(chatId, data) {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return false;
        }
        
        try {
            const result = await this.apiClient.patch(`/chats/${chatId}`, data);
            
            if (result.version) {
                this.chatStore.setVersion(chatId, result.version);
                console.log(`✅ Чат ${chatId} обновлён, новая версия: ${result.version}`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка обновления чата ${chatId}:`, err);
            return false;
        }
    }
    
    // ==========================================
    // ПЕРЕИМЕНОВАНИЕ ЧАТА
    // ==========================================
    
    async renameChat(chatId, newTitle) {
        const result = await this.updateChat(chatId, { 
            title: newTitle.trim(),
            userRenamed: true 
        });
        
        if (result) {
            this.chatStore.renameChat(chatId, newTitle);
        }
        return result;
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ КОНТЕКСТА
    // ==========================================
    
    async updateContext(chatId, maxContext) {
        const result = await this.updateChat(chatId, { maxContext: maxContext });
        
        if (result) {
            this.chatStore.updateChat(chatId, { maxContext: maxContext });
        }
        return result;
    }
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА
    // ==========================================
    
    async deleteChat(chatId) {
        if (!this.userStore.canSync()) {
            // Офлайн-режим: удаляем только локально
            this.chatStore.deleteChat(chatId);
            return true;
        }
        
        try {
            const result = await this.apiClient.delete(`/chats/${chatId}`);
            
            if (result.success) {
                this.chatStore.deleteChat(chatId);
                console.log(`✅ Чат ${chatId} удалён на сервере`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка удаления чата ${chatId}:`, err);
            // В случае ошибки всё равно удаляем локально
            this.chatStore.deleteChat(chatId);
            return false;
        }
    }
}

// Экспорт
window.ChatService = ChatService;
window.chatService = new ChatService();

console.log('✅ ChatService v2.0 загружен');
