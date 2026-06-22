// ============================================
// js/services/messages.js
// Описание: Работа с сообщениями (с версионностью)
// Версия: 2.0.1
// ============================================

class MessageService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.chatService = window.chatService;
    }
    
    // ==========================================
    // ОТПРАВКА СООБЩЕНИЯ
    // ==========================================
    
    async sendMessage(chatId, text, type, options = {}) {
        // Проверка интернета
        if (!navigator.onLine) {
            console.warn('⚠️ Нет интернета, сообщение не отправлено');
            return null;
        }
        
        const found = this.chatStore.findChat(chatId);
        if (!found) {
            console.error(`❌ Чат ${chatId} не найден`);
            return null;
        }
        
        const chat = found.chat;
        const isFirstMessage = !this.chatStore.hasRealMessages(chat);
        
        // Сохраняем сообщение локально (оптимистично)
        const message = this.chatStore.addMessage(chatId, text, type, {
            synced: false,
            isFavorite: options.isFavorite || false,
            id: options.id || undefined
        });
        
        if (!message) return null;
        
        // Если синхронизация отключена
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена, сообщение сохранено локально');
            return message;
        }
        
        try {
            // Если чат не синхронизирован или это первое сообщение
            if (!chat.synced || isFirstMessage) {
                console.log(`📤 Создаём чат ${chat.id} в облаке с первым сообщением...`);
                
                // Создаём чат через ChatService
                const created = await this.chatService.createChat(
                    chat.topic,
                    chat.title,
                    {
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed,
                        firstMessage: message,
                        existingChatId: chat.id
                    }
                );
                
                if (created) {
                    chat.synced = true;
                    if (created.id && created.id !== chat.id) {
                        this.chatStore.updateChatId(chat.id, created.id);
                    }
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                    console.log(`✅ Чат ${chat.id} создан в облаке, сообщение синхронизировано`);
                    return message;
                } else {
                    console.error(`❌ Не удалось создать чат ${chat.id} в облаке`);
                    return message;
                }
            }
            
            // Отправляем сообщение в существующий чат
            const result = await this.apiClient.post(`/chats/${chatId}/message`, {
                text: message.text,
                type: message.type,
                messageId: message.id,
                isFavorite: message.isFavorite || false
            });
            
            if (result.success || result.messageId) {
                // Обновляем версию чата
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                
                // Обновляем ID сообщения если изменился
                if (result.messageId && result.messageId !== message.id) {
                    const foundChat = this.chatStore.findChat(chatId);
                    if (foundChat) {
                        const msg = foundChat.chat.messages.find(m => m.id === message.id);
                        if (msg) {
                            msg.id = result.messageId;
                            msg.synced = true;
                            this.chatStore.saveToStorage();
                        }
                    }
                } else {
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                }
                
                console.log(`✅ Сообщение ${message.id} синхронизировано`);
                return message;
            }
            
            return message;
        } catch (err) {
            console.error('❌ Ошибка отправки сообщения:', err);
            return message;
        }
    }
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ (ИСПРАВЛЕНО)
    // ==========================================
    
    async deleteMessage(chatId, messageId) {
        // Проверка интернета
        if (!navigator.onLine) {
            console.warn('⚠️ Нет интернета, удаление невозможно');
            return false;
        }
        
        // Оптимистично удаляем локально
        this.chatStore.deleteMessage(chatId, messageId);
        
        // Если синхронизация отключена
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена, сообщение удалено локально');
            return true;
        }
        
        try {
            // ✅ ИСПРАВЛЕНО: используем правильный эндпоинт
            const result = await this.apiClient.post('/chats/actions/message', {
                action: 'delete_message',
                chatId: chatId,
                messageId: messageId
            });
            
            if (result.success) {
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Сообщение ${messageId} удалено на сервере`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`❌ Ошибка удаления сообщения ${messageId}:`, err);
            return false;
        }
    }
    
    // ==========================================
    // ПЕРЕКЛЮЧЕНИЕ ИЗБРАННОГО
    // ==========================================
    
    async toggleFavorite(chatId, messageId) {
        // Проверка интернета
        if (!navigator.onLine) {
            console.warn('⚠️ Нет интернета, изменение избранного невозможно');
            return this.chatStore.toggleFavorite(chatId, messageId);
        }
        
        // Оптимистично переключаем локально
        const msg = this.chatStore.toggleFavorite(chatId, messageId);
        if (!msg) return null;
        
        // Если синхронизация отключена
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена, избранное сохранено локально');
            return msg;
        }
        
        try {
            const result = await this.apiClient.post('/chats/actions/favorite', {
                action: 'favorite_message',
                chatId: chatId,
                messageId: messageId,
                isFavorite: msg.isFavorite
            });
            
            if (result.success) {
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                console.log(`✅ Избранное ${messageId} синхронизировано`);
                return msg;
            }
            return msg;
        } catch (err) {
            console.error(`❌ Ошибка синхронизации избранного ${messageId}:`, err);
            return msg;
        }
    }
    
    // ==========================================
    // МАССОВАЯ ОТПРАВКА
    // ==========================================
    
    async sendBatch(chatId, messages, chatInfo = {}) {
        if (!this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена');
            return null;
        }
        
        try {
            const result = await this.apiClient.post('/chats/actions/batch', {
                action: 'batch_messages',
                chatId: chatId,
                topicId: chatInfo.topicId,
                chatTitle: chatInfo.chatTitle,
                maxContext: chatInfo.maxContext,
                userRenamed: chatInfo.userRenamed,
                messages: messages
            });
            
            if (result.success) {
                if (result.version) {
                    this.chatStore.setVersion(chatId, result.version);
                }
                const messageIds = messages.map(m => m.id);
                this.chatStore.markMessagesSynced(chatId, messageIds);
                return result;
            }
            return null;
        } catch (err) {
            console.error('❌ Ошибка массовой отправки:', err);
            return null;
        }
    }
}

// Экспорт
window.MessageService = MessageService;
window.messageService = new MessageService();

console.log('✅ MessageService v2.0.1 загружен');
