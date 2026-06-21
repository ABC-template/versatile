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
        const found = this.chatStore.findChat(chatId);
        if (!found) {
            console.error(`❌ Чат ${chatId} не найден`);
            return null;
        }
        
        const chat = found.chat;
        const isFirstMessage = !this.chatStore.hasRealMessages(chat);
        
        const message = this.chatStore.addMessage(chatId, text, type, {
            synced: false,
            isFavorite: options.isFavorite || false
        });
        
        if (this.userStore.canSync()) {
            if (!chat.synced || isFirstMessage) {
                console.log(`📤 Создаем чат ${chat.id} в облаке с первым сообщением...`);
                
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
                    console.log(`✅ Чат ${chat.id} создан в облаке, сообщение синхронизировано`);
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                    return message;
                } else {
                    console.error(`❌ Не удалось создать чат ${chat.id} в облаке`);
                    this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
                    return message;
                }
            }
            
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
        
        return message;
    }
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================
    
    async deleteMessage(chatId, messageId) {
        this.chatStore.deleteMessage(chatId, messageId);
        
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
                this.syncStore.addUnsyncedMessage(chatId, { id: messageId, deleted: true }, null, null, null, null);
            }
        }
        
        return true;
    }
    
    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================
    
    async toggleFavorite(chatId, messageId) {
        const msg = this.chatStore.toggleFavorite(chatId, messageId);
        if (!msg) return false;
        
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

window.MessageService = MessageService;
window.messageService = new MessageService();

console.log('✅ MessageService загружен');
