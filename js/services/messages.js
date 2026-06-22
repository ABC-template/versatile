// ============================================
// js/services/messages.js
// Описание: Работа с сообщениями (УПРОЩЕННАЯ ВЕРСИЯ)
// Версия: 3.0.1
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

        // ==========================================
        // ✅ ЕСЛИ ПЕРЕДАН ID - СООБЩЕНИЕ УЖЕ СУЩЕСТВУЕТ
        // ==========================================
        if (options.id) {
            console.log(`📤 [sendMessage] Сообщение уже существует (ID: ${options.id}), просто синхронизируем`);
            
            // Находим существующее сообщение
            const existingMsg = chat.messages.find(m => m.id === options.id);
            if (!existingMsg) {
                console.error(`❌ [sendMessage] Сообщение с ID ${options.id} не найдено в чате`);
                return null;
            }

            // Если синхронизация включена (PRO) — отправляем на сервер
            if (this.userStore.canSync()) {
                // Проверяем, нужно ли создать чат на сервере
                if (!chat.synced) {
                    console.log(`📤 [sendMessage] Чат не синхронизирован, создаем...`);
                    const created = await this.chatService.createChat(
                        chat.topic,
                        chat.title,
                        {
                            maxContext: chat.maxContext,
                            userRenamed: chat.userRenamed,
                            firstMessage: existingMsg,
                            existingChatId: chat.id
                        }
                    );
                    if (created) {
                        chat.synced = true;
                        console.log(`✅ [sendMessage] Чат ${chat.id} создан на сервере`);
                    } else {
                        console.error(`❌ [sendMessage] Не удалось создать чат ${chat.id}`);
                        return existingMsg;
                    }
                }

                // Отправляем сообщение на сервер
                try {
                    console.log(`📤 [sendMessage] Отправка на сервер: ${existingMsg.id}`);
                    const result = await this.apiClient.post('/chats/actions/message', {
                        action: 'new_message',
                        chatId: chatId,
                        message: {
                            id: existingMsg.id,
                            text: existingMsg.text,
                            type: existingMsg.type,
                            isFavorite: existingMsg.isFavorite || false
                        }
                    });

                    if (result.synced || result.success) {
                        console.log(`✅ [sendMessage] Сообщение ${existingMsg.id} синхронизировано`);
                    } else {
                        console.warn(`⚠️ [sendMessage] Сообщение ${existingMsg.id} не синхронизировано`);
                    }
                } catch (err) {
                    console.error(`❌ [sendMessage] Ошибка синхронизации:`, err);
                }
            } else {
                console.log(`⏭️ [sendMessage] Синхронизация отключена (TRIAL)`);
            }

            return existingMsg;
        }

        // ==========================================
        // ✅ НОВОЕ СООБЩЕНИЕ (ID НЕ ПЕРЕДАН)
        // ==========================================
        
        console.log(`📤 [sendMessage] Новое сообщение, создаем локально`);
        
        // Генерируем ID
        const messageId = this.chatStore.generateUUID();
        const isFirstMessage = !this.chatStore.hasRealMessages(chat);

        // Сохраняем локально
        const message = this.chatStore.addMessage(chatId, text, type, {
            id: messageId,
            isFavorite: options.isFavorite || false,
            created_at: options.created_at || new Date().toISOString()
        });

        if (!message) return null;

        // Если синхронизация включена (PRO)
        if (this.userStore.canSync()) {
            // Проверяем, нужно ли создать чат на сервере
            if (!chat.synced || isFirstMessage) {
                console.log(`📤 [sendMessage] Создаем чат ${chat.id} на сервере...`);
                
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
                    console.log(`✅ [sendMessage] Чат ${chat.id} создан на сервере`);
                } else {
                    console.error(`❌ [sendMessage] Не удалось создать чат ${chat.id}`);
                    return message;
                }
            }

            // Отправляем сообщение на сервер
            try {
                const result = await this.apiClient.post('/chats/actions/message', {
                    action: 'new_message',
                    chatId: chatId,
                    message: {
                        id: message.id,
                        text: message.text,
                        type: message.type,
                        isFavorite: message.isFavorite || false
                    }
                });

                if (result.synced || result.success) {
                    console.log(`✅ [sendMessage] Сообщение ${message.id} синхронизировано`);
                } else {
                    console.warn(`⚠️ [sendMessage] Сообщение ${message.id} не синхронизировано`);
                }
            } catch (err) {
                console.error(`❌ [sendMessage] Ошибка синхронизации:`, err);
            }
        } else {
            console.log(`⏭️ [sendMessage] Синхронизация отключена (TRIAL)`);
        }

        return message;
    }

    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================

    async deleteMessage(chatId, messageId) {
        // Всегда удаляем локально
        this.chatStore.deleteMessage(chatId, messageId);

        // Если синхронизация включена — удаляем на сервере
        if (this.userStore.canSync()) {
            try {
                const result = await this.apiClient.post('/chats/actions/message', {
                    action: 'delete_message',
                    chatId: chatId,
                    messageId: messageId
                });

                if (result.success) {
                    console.log(`✅ [deleteMessage] Сообщение ${messageId} удалено на сервере`);
                    return true;
                }
                return false;
            } catch (err) {
                console.error(`❌ [deleteMessage] Ошибка удаления:`, err);
                return false;
            }
        }

        return true;
    }

    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================

    async toggleFavorite(chatId, messageId) {
        // Всегда переключаем локально
        const msg = this.chatStore.toggleFavorite(chatId, messageId);
        if (!msg) return null;

        // Если синхронизация включена — синхронизируем
        if (this.userStore.canSync()) {
            try {
                const result = await this.apiClient.post('/chats/actions/favorite', {
                    action: 'favorite_message',
                    chatId: chatId,
                    messageId: messageId,
                    isFavorite: msg.isFavorite
                });

                if (result.success) {
                    console.log(`✅ [toggleFavorite] Избранное ${messageId} синхронизировано`);
                }
            } catch (err) {
                console.error(`❌ [toggleFavorite] Ошибка синхронизации:`, err);
            }
        }

        return msg;
    }
}

// Экспорт
window.MessageService = MessageService;
window.messageService = new MessageService();

console.log('✅ MessageService v3.0.1 загружен');
