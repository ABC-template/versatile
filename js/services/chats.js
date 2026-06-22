// ============================================
// js/services/chats.js
// Описание: CRUD операции с чатами (с версионностью)
// Версия: 2.0.2 (исправлены пути API)
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
            const data = await this.apiClient.get('/chats/sync-metadata');
            
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
    // ОТКРЫТИЕ ЧАТА (С ПРОВЕРКОЙ ВЕРСИИ)
    // ==========================================
    
    async openChat(chatId) {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return false;
        }
        
        try {
            const localVersion = this.chatStore.getVersion(chatId);
            
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
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
    // ПОЛУЧЕНИЕ ПОЛНОГО ЧАТА
    // ==========================================
    
    async getChat(chatId) {
        try {
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
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
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const result = await this.apiClient.post('/chats/actions/update', {
                action: 'update_context',
                chatId: chatId,
                ...data
            });
            
            if (result.success) {
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Чат ${chatId} обновлён`);
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
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return false;
        }
        
        try {
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const result = await this.apiClient.post('/chats/actions/update', {
                action: 'rename_chat',
                chatId: chatId,
                newTitle: newTitle.trim()
            });
            
            if (result.success) {
                this.chatStore.renameChat(chatId, newTitle);
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Чат ${chatId} переименован`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка переименования чата ${chatId}:`, err);
            return false;
        }
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ КОНТЕКСТА
    // ==========================================
    
    async updateContext(chatId, maxContext) {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return false;
        }
        
        try {
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const result = await this.apiClient.post('/chats/actions/update', {
                action: 'update_context',
                chatId: chatId,
                maxContext: maxContext
            });
            
            if (result.success) {
                this.chatStore.updateChat(chatId, { maxContext: maxContext });
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Контекст чата ${chatId} обновлён`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка обновления контекста ${chatId}:`, err);
            return false;
        }
    }
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА
    // ==========================================
    
    async deleteChat(chatId) {
        if (!this.userStore.canSync()) {
            this.chatStore.deleteChat(chatId);
            return true;
        }
        
        try {
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const result = await this.apiClient.post('/chats/actions/update', {
                action: 'delete_chat',
                chatId: chatId
            });
            
            if (result.success) {
                this.chatStore.deleteChat(chatId);
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Чат ${chatId} удалён на сервере`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка удаления чата ${chatId}:`, err);
            this.chatStore.deleteChat(chatId);
            return false;
        }
    }
    
    // ==========================================
    // СОЗДАНИЕ ЧАТА
    // ==========================================
    
    async createChat(topicId, title, options = {}) {
        const hasMessages = options.firstMessage && options.firstMessage.text;
        
        if (!hasMessages) {
            console.warn('⚠️ Попытка создать пустой чат — отклонено');
            return null;
        }
        
        try {
            const chatId = options.existingChatId || undefined;
            
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const data = await this.apiClient.post('/chats/actions/create', {
                action: 'create_chat',
                chat: {
                    id: chatId,
                    topic_id: topicId,
                    title: title || `Чат в ${topicId}`,
                    max_context: options.maxContext || 15,
                    user_renamed: options.userRenamed || false
                },
                firstMessage: options.firstMessage || null
            });
            
            if (data.success) {
                const existingChat = this.chatStore.findChat(data.chatId);
                
                if (existingChat) {
                    const updatedChat = this.chatStore.updateChat(data.chatId, {
                        synced: true,
                        title: title || existingChat.chat.title,
                        updated_at: new Date().toISOString()
                    });
                    
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
                    
                    if (data.version) {
                        this.chatStore.setVersion(data.chatId, data.version);
                    }
                    
                    console.log(`✅ Чат ${data.chatId} обновлён в облаке`);
                    return updatedChat || existingChat.chat;
                } else {
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
                    
                    if (data.version) {
                        this.chatStore.setVersion(data.chatId, data.version);
                    }
                    
                    console.log(`✅ Создан новый чат ${data.chatId} в облаке`);
                    return chat;
                }
            }
            return null;
        } catch (err) {
            console.error('❌ Ошибка создания чата:', err);
            return null;
        }
    }
}

// Экспорт
window.ChatService = ChatService;
window.chatService = new ChatService();

console.log('✅ ChatService v2.0.2 загружен');
