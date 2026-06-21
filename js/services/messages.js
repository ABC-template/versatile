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
    // ✅ ИСПРАВЛЕНО: ОТПРАВКА СООБЩЕНИЯ
    // ==========================================
    
    async sendMessage(chatId, text, type, options = {}) {
        // Находим чат
        const found = this.chatStore.findChat(chatId);
        if (!found) {
            console.error(`❌ Чат ${chatId} не найден`);
            return null;
        }
        
        const chat = found.chat;
        
        // ✅ Если чат пустой и не синхронизирован — помечаем, что скоро будет синхронизирован
        const isFirstMessage = !this.chatStore.hasRealMessages(chat);
        
        // Сохраняем сообщение локально
        const message = this.chatStore.addMessage(chatId, text, type, {
            synced: false,
            isFavorite: options.isFavorite || false
        });
        
        // ✅ Если это первое сообщение — создаем чат в облаке
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
                    // Добавляем в очередь
                    this.syncStore.addUnsyncedMessage(chatId, message, chat.topic, chat.title, chat.maxContext, chat.userRenamed);
                    return message;
                }
            }
            
            // Если чат уже синхронизирован — отправляем сообщение
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
    
    // ... остальные методы без изменений
}
