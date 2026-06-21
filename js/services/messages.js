// ============================================
// js/services/messages.js
// Описание: CRUD операции с сообщениями
// ✅ ИСПРАВЛЕНО: удаление с восстановлением при ошибке
// ✅ ИСПРАВЛЕНО: отдельная очередь для удалений
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
            const needsCreation = !chat.synced || isFirstMessage || !chat.id;
            
            if (needsCreation) {
                console.log(`📤 Создаем чат ${chat.id} в облаке с первым сообщением...`);
                
                const created = await window.chatService.createChat(
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
    // ✅ ИСПРАВЛЕНО: УДАЛЕНИЕ СООБЩЕНИЯ С ВОССТАНОВЛЕНИЕМ
    // ==========================================
    
    async deleteMessage(chatId, messageId) {
        // 1. Находим сообщение для возможного восстановления
        const found = this.chatStore.findChat(chatId);
        let msgCopy = null;
        
        if (found) {
            const originalMsg = found.chat.messages.find(m => m.id === messageId);
            if (originalMsg) {
                msgCopy = { ...originalMsg };
            }
        }
        
        // 2. Оптимистично удаляем из стора
        this.chatStore.deleteMessage(chatId, messageId);
        
        // 3. Удаляем из DOM (если есть)
        const domBlock = document.getElementById(`msg-block-${messageId}`);
        if (domBlock) {
            domBlock.style.transition = 'all 0.25s ease';
            domBlock.style.opacity = '0';
            domBlock.style.transform = 'scale(0.95)';
            setTimeout(() => domBlock.remove(), 250);
        }
        
        // 4. Если синхронизация выключена, просто выходим
        if (!this.userStore.canSync()) {
            return true;
        }
        
        // 5. Пытаемся удалить на сервере
        try {
            const data = await this.apiClient.post('/chats/actions/message', {
                action: 'delete_message',
                chatId: chatId,
                messageId: messageId
            });
            
            if (data.success) {
                console.log(`✅ Сообщение ${messageId} удалено из облака`);
                // Удаляем из очереди удалений, если было
                this.syncStore.removeUnsyncedDeletion(chatId, messageId);
                return true;
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err) {
            console.error('Delete message sync error:', err);
            
            // ✅ ВОССТАНАВЛИВАЕМ сообщение при ошибке
            if (msgCopy) {
                // Восстанавливаем в сторе
                const restoreResult = this.chatStore.restoreMessage(chatId, msgCopy);
                if (restoreResult) {
                    console.log(`♻️ Сообщение ${messageId} восстановлено локально из-за ошибки синхронизации`);
                    
                    // Восстанавливаем в DOM
                    const container = document.getElementById('chat-container');
                    if (container && window.uiRenderer) {
                        const msgDiv = window.uiRenderer.renderMessage(
                            msgCopy.text,
                            msgCopy.type,
                            msgCopy.id,
                            msgCopy.isFavorite
                        );
                        if (msgDiv) {
                            msgDiv.style.animation = 'none';
                            msgDiv.style.opacity = '0';
                            requestAnimationFrame(() => {
                                msgDiv.style.transition = 'opacity 0.3s ease';
                                msgDiv.style.opacity = '1';
                            });
                        }
                    }
                }
            }
            
            // ✅ Добавляем в ОТДЕЛЬНУЮ очередь удалений
            this.syncStore.addUnsyncedDeletion(chatId, messageId);
            
            return false;
        }
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
