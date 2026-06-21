// ============================================
// js/services/messages.js
// Описание: CRUD операции с сообщениями
// ============================================

class MessageService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.syncStore = window.syncStore;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // ОТПРАВКА СООБЩЕНИЯ
    // ==========================================
    
async sendMessage(chatId, text, type, options = {}) {
    // Сначала сохраняем локально
    const message = this.chatStore.addMessage(chatId, text, type, {
        synced: false,
        isFavorite: options.isFavorite || false
    });
    
    // Если синхронизация включена
    if (this.userStore.canSync()) {
        const found = this.chatStore.findChat(chatId);
        const chat = found?.chat;
        
        if (chat) {
            // Если чат не синхронизирован — сначала создаем его в облаке
            if (!chat.synced) {
                console.log(`📤 Создаем чат ${chat.id} в облаке перед отправкой сообщения...`);
                const created = await window.chatService.createChat(
                    chat.topic,
                    chat.title,
                    {
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed,
                        firstMessage: message
                    }
                );
                
                if (created) {
                    console.log(`✅ Чат ${chat.id} создан в облаке`);
                    // Сообщение уже добавлено в firstMessage, отмечаем как синхронизированное
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                    return message;
                } else {
                    // Если не удалось создать чат, добавляем в очередь
                    this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
                    return message;
                }
            }
            
            // Если чат синхронизирован — отправляем сообщение
            try {
                const data = await this.apiClient.post('/chats/actions/message', {
                    action: 'new_message',
                    chatId: chatId,
                    message: {
                        id: message.id,
                        text: message.text,
                        type: message.type,
                        isFavorite: message.isFavorite || false
                    }
                });
                
                if (data.synced || data.success) {
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                    console.log(`✅ Сообщение ${message.id} синхронизировано`);
                    return message;
                }
            } catch (err) {
                console.error('Sync message error:', err);
                this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
            }
        }
    }
    
    return message;
}
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================
    
    async deleteMessage(chatId, messageId) {
        // Сначала удаляем локально
        this.chatStore.deleteMessage(chatId, messageId);
        
        // Если синхронизация включена
        if (this.userStore.canSync()) {
            try {
                const data = await this.apiClient.post('/chats/actions/message', {
                    action: 'delete_message',
                    chatId: chatId,
                    messageId: messageId
                });
                
                if (data.success) {
                    console.log(`✅ Сообщение ${messageId} удалено из облака`);
                    return true;
                }
            } catch (err) {
                console.error('Delete message sync error:', err);
                // Добавляем в очередь на удаление
                this.syncStore.addUnsyncedMessage(chatId, { id: messageId, deleted: true }, null, null, null, null);
            }
        }
        
        return true;
    }
    
    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================
    
    async toggleFavorite(chatId, messageId) {
        // Сначала меняем локально
        const msg = this.chatStore.toggleFavorite(chatId, messageId);
        if (!msg) return false;
        
        // Если синхронизация включена
        if (this.userStore.canSync()) {
            try {
                const data = await this.apiClient.post('/chats/actions/favorite', {
                    action: 'favorite_message',
                    chatId: chatId,
                    messageId: messageId,
                    isFavorite: msg.isFavorite
                });
                
                if (data.success) {
                    console.log(`✅ Избранное синхронизировано: ${messageId} = ${msg.isFavorite}`);
                    return msg;
                }
            } catch (err) {
                console.error('Favorite sync error:', err);
                this.syncStore.addUnsyncedFavorite(messageId, chatId, msg.isFavorite);
            }
        } else {
            // Добавляем в офлайн-очередь
            this.syncStore.addUnsyncedFavorite(messageId, chatId, msg.isFavorite);
        }
        
        return msg;
    }
    
    // ==========================================
    // МАССОВАЯ ОТПРАВКА
    // ==========================================
    
    async sendBatch(chatId, messages, chatInfo = {}) {
        try {
            const data = await this.apiClient.post('/chats/actions/batch', {
                action: 'batch_messages',
                chatId: chatId,
                topicId: chatInfo.topicId,
                chatTitle: chatInfo.chatTitle,
                maxContext: chatInfo.maxContext,
                userRenamed: chatInfo.userRenamed,
                messages: messages
            });
            
            if (data.synced || data.success) {
                // Отмечаем все сообщения как синхронизированные
                const messageIds = messages.map(m => m.id);
                this.chatStore.markMessagesSynced(chatId, messageIds);
                return data;
            }
            return null;
        } catch (err) {
            console.error('Batch send error:', err);
            return null;
        }
    }
}

// Экспортируем как глобальный объект
window.MessageService = MessageService;
window.messageService = new MessageService();

console.log('✅ MessageService загружен');
