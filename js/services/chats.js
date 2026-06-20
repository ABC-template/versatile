// ============================================
// js/services/chats.js
// Описание: CRUD операции с чатами
// ============================================

class ChatService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // ПОЛУЧЕНИЕ ЧАТА
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
                return syncedChat;
            }
            return null;
        } catch (err) {
            console.error('Get chat error:', err);
            return null;
        }
    }
    
    // ==========================================
    // ПОЛУЧЕНИЕ МЕТАДАННЫХ
    // ==========================================
    
    async getMetadata() {
        try {
            const data = await this.apiClient.get('/chats/sync-metadata');
            
            if (data.syncEnabled && data.chats) {
                // Сохраняем метаданные в глобальный кэш
                if (!window.cloudChatsMeta) {
                    window.cloudChatsMeta = {};
                }
                
                for (const chat of data.chats) {
                    const existing = window.cloudChatsMeta[chat.id];
                    if (!existing || new Date(chat.updated_at) > new Date(existing.updated_at)) {
                        window.cloudChatsMeta[chat.id] = chat;
                    }
                }
                
                // Обновляем favorites
                if (data.favorites) {
                    window.cloudFavorites = data.favorites;
                }
                
                return {
                    chats: data.chats,
                    favorites: data.favorites || [],
                    syncEnabled: true
                };
            }
            
            return {
                chats: [],
                favorites: [],
                syncEnabled: false
            };
        } catch (err) {
            console.error('Get metadata error:', err);
            return {
                chats: [],
                favorites: [],
                syncEnabled: false
            };
        }
    }
    
    // ==========================================
    // СОЗДАНИЕ ЧАТА
    // ==========================================
    
    async createChat(topicId, title, options = {}) {
        try {
            const data = await this.apiClient.post('/chats/actions/create', {
                action: 'create_chat',
                chat: {
                    topic_id: topicId,
                    title: title || `Чат в ${topicId}`,
                    max_context: options.maxContext || 15,
                    user_renamed: options.userRenamed || false
                },
                firstMessage: options.firstMessage || null
            });
            
            if (data.success) {
                const chat = this.chatStore.createChat(topicId, title, {
                    ...options,
                    synced: true,
                    id: data.chatId
                });
                
                // Если есть первое сообщение, добавляем его
                if (options.firstMessage && data.messageId) {
                    this.chatStore.addMessage(
                        data.chatId,
                        options.firstMessage.text,
                        options.firstMessage.type || 'user-msg',
                        {
                            id: data.messageId,
                            synced: true
                        }
                    );
                }
                
                return chat;
            }
            return null;
        } catch (err) {
            console.error('Create chat error:', err);
            return null;
        }
    }
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА (SOFT DELETE)
    // ==========================================
    
    async deleteChat(chatId) {
        try {
            const data = await this.apiClient.post('/chats/actions/message', {
                action: 'delete_chat',
                chatId: chatId
            });
            
            if (data.success) {
                this.chatStore.deleteChat(chatId);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Delete chat error:', err);
            return false;
        }
    }
    
    // ==========================================
    // ПЕРЕИМЕНОВАНИЕ ЧАТА
    // ==========================================
    
    async renameChat(chatId, newTitle) {
        try {
            const data = await this.apiClient.post('/chats/actions/update', {
                action: 'rename_chat',
                chatId: chatId,
                newTitle: newTitle
            });
            
            if (data.success) {
                this.chatStore.renameChat(chatId, newTitle);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Rename chat error:', err);
            return false;
        }
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ КОНТЕКСТА
    // ==========================================
    
    async updateContext(chatId, maxContext) {
        try {
            const data = await this.apiClient.post('/chats/actions/update', {
                action: 'update_context',
                chatId: chatId,
                maxContext: maxContext
            });
            
            if (data.success) {
                this.chatStore.updateChat(chatId, { maxContext: maxContext });
                return true;
            }
            return false;
        } catch (err) {
            console.error('Update context error:', err);
            return false;
        }
    }
}

// Экспортируем как глобальный объект
window.ChatService = ChatService;
window.chatService = new ChatService();

console.log('✅ ChatService загружен');
