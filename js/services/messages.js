// ============================================
// js/services/messages.js
// Описание: Работа с сообщениями (УПРОЩЕННАЯ ВЕРСИЯ)
// Версия: 3.0.0
// ============================================

class MessageService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.chatService = window.chatService;
    }

    // ==========================================
    // ОТПРАВКА СООБЩЕНИЯ (УПРОЩЕНО)
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
        const messageId = options.id || this.chatStore.generateUUID();

        // ✅ 1. ВСЕГДА сохраняем локально (для всех пользователей)
        const message = this.chatStore.addMessage(chatId, text, type, {
            id: messageId,
            isFavorite: options.isFavorite || false,
            created_at: options.created_at || new Date().toISOString()
        });

        if (!message) return null;

        // ✅ 2. Если синхронизация включена (PRO) — отправляем на сервер
        if (this.userStore.canSync()) {
            // Проверяем, нужно ли сначала создать чат на сервере
            const isFirstMessage = !this.chatStore.hasRealMessages(chat);
            const chatNeedsCreation = !chat.deleted_at && !chat.id;

            if (!chatNeedsCreation && (isFirstMessage || !chat.id)) {
                // Создаем чат на сервере
                console.log(`📤 Создаём чат ${chat.id} в облаке с первым сообщением...`);

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
                    console.log(`✅ Чат ${chat.id} создан в облаке`);
                    return message;
                } else {
                    console.error(`❌ Не удалось создать чат ${chat.id} в облаке`);
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
                    console.log(`✅ Сообщение ${message.id} синхронизировано`);
                } else {
                    console.warn(`⚠️ Сообщение ${message.id} не синхронизировано`);
                }
            } catch (err) {
                console.error('❌ Ошибка синхронизации сообщения:', err);
            }
        }

        return message;
    }

    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ (УПРОЩЕНО)
    // ==========================================

    async deleteMessage(chatId, messageId) {
        // ✅ Всегда удаляем локально
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
                    console.log(`✅ Сообщение ${messageId} удалено на сервере`);
                    return true;
                }
                return false;
            } catch (err) {
                console.error(`❌ Ошибка удаления сообщения ${messageId}:`, err);
                return false;
            }
        }

        return true;
    }

    // ==========================================
    // ИЗБРАННОЕ (УПРОЩЕНО)
    // ==========================================

    async toggleFavorite(chatId, messageId) {
        // ✅ Всегда переключаем локально
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
                    console.log(`✅ Избранное ${messageId} синхронизировано`);
                }
            } catch (err) {
                console.error(`❌ Ошибка синхронизации избранного ${messageId}:`, err);
            }
        }

        return msg;
    }
}

// Экспорт
window.MessageService = MessageService;
window.messageService = new MessageService();

console.log('✅ MessageService v3.0 загружен (упрощенная версия)');
