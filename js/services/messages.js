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
        
        // Сохраняем сообщение локально
        const message = this.chatStore.addMessage(chatId, text, type, {
            synced: false,
            isFavorite: options.isFavorite || false
        });
        
        // Если синхронизация включена
        if (this.userStore.canSync()) {
            // ✅ ИСПРАВЛЕНО: проверяем, нужно ли создавать чат
            // Создаём чат только если:
            // 1. Чат ещё не синхронизирован (chat.synced === false)
            // 2. И это первое сообщение в чате (isFirstMessage === true)
            // 3. ИЛИ чат не имеет ID (старый баг)
            const needsCreation = !chat.synced || isFirstMessage || !chat.id;
            
            if (needsCreation) {
                console.log(`📤 Создаем чат ${chat.id} в облаке с первым сообщением...`);
                
                // ✅ ИСПРАВЛЕНО: передаём существующий ID чата
                const created = await window.chatService.createChat(
                    chat.topic,
                    chat.title,
                    {
                        maxContext: chat.maxContext,
                        userRenamed: chat.userRenamed,
                        firstMessage: message,
                        existingChatId: chat.id  // ← Передаём ID существующего чата
                    }
                );
                
                if (created) {
                    // ✅ ИСПРАВЛЕНО: помечаем чат как синхронизированный
                    chat.synced = true;
                    // Если облачный ID отличается от локального, обновляем
                    if (created.id && created.id !== chat.id) {
                        // Обновляем ID чата во всех местах
                        this.chatStore.updateChatId(chat.id, created.id);
                    }
                    this.chatStore.saveToStorage();
                    
                    this.chatStore.markMessagesSynced(chatId, [message.id]);
                    console.log(`✅ Чат ${chat.id} создан в облаке, сообщение синхронизировано`);
                    return message;
                } else {
                    console.error(`❌ Не удалось создать чат ${chat.id} в облаке`);
                    this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
                    return message;
                }
            }
            
            // ✅ Если чат уже синхронизирован — отправляем сообщение
            try {
                const data = await this.apiClient.post('/chats/actions/message', {
                    action: 'new_message',
                    chatId: chat.id || chatId,
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
                } else {
                    console.warn(`⚠️ Сообщение ${message.id} не синхронизировано, добавим в очередь`);
                    this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
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
