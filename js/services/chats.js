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
                if (!window.cloudChatsMeta) {
                    window.cloudChatsMeta = {};
                }
                
                for (const chat of data.chats) {
                    const existing = window.cloudChatsMeta[chat.id];
                    if (!existing || new Date(chat.updated_at) > new Date(existing.updated_at)) {
                        window.cloudChatsMeta[chat.id] = chat;
                    }
                }
                
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
    // ✅ ИСПРАВЛЕНО: СОЗДАНИЕ ЧАТА
    // ==========================================
    
    async createChat(topicId, title, options = {}) {
        const hasMessages = options.firstMessage && options.firstMessage.text;
        
        if (!hasMessages) {
            console.warn('⚠️ Попытка создать пустой чат — отклонено');
            return null;
        }
        
        try {
            // ✅ ИСПРАВЛЕНО: если передан existingChatId, используем его
            const chatId = options.existingChatId || undefined;
            
            const data = await this.apiClient.post('/chats/actions/create', {
                action: 'create_chat',
                chat: {
                    id: chatId,  // ← Передаём существующий ID
                    topic_id: topicId,
                    title: title || `Чат в ${topicId}`,
                    max_context: options.maxContext || 15,
                    user_renamed: options.userRenamed || false
                },
                firstMessage: options.firstMessage || null
            });
            
            if (data.success) {
                // ✅ ИСПРАВЛЕНО: проверяем, есть ли уже локальный чат с таким ID
                const existingChat = this.chatStore.findChat(data.chatId);
                
                if (existingChat) {
                    // ✅ Обновляем существующий чат, а не создаём новый
                    const updatedChat = this.chatStore.updateChat(data.chatId, {
                        synced: true,
                        title: title || existingChat.chat.title,
                        updated_at: new Date().toISOString()
                    });
                    
                    // Добавляем первое сообщение, если его нет
                    if (options.firstMessage && data.messageId) {
                        const existingMsg = existingChat.chat.messages.find(
                            m => m.id === options.firstMessage.id
                        );
                        if (!existingMsg) {
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
                    }
                    
                    console.log(`✅ Чат ${data.chatId} обновлён в облаке`);
                    return updatedChat || existingChat.chat;
                } else {
                    // Создаём новый чат, если его нет локально
                    const chat = this.chatStore.createChat(topicId, title, {
                        ...options,
                        synced: true,
                        id: data.chatId
                    });
                    
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
                    
                    console.log(`✅ Создан новый чат ${data.chatId} в облаке`);
                    return chat;
                }
            }
            return null;
        } catch (err) {
            console.error('Create chat error:', err);
            return null;
        }
    }
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА
    // ==========================================
    
    async deleteChat(chatId) {
        try {
            const data = await this.apiClient.post('/chats/actions/update', {
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

window.ChatService = ChatService;
window.chatService = new ChatService();

console.log('✅ ChatService загружен');
