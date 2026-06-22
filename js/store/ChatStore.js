// ============================================
// js/store/ChatStore.js
// Описание: Управление чатами и сообщениями (УПРОЩЕННАЯ ВЕРСИЯ)
// Версия: 3.0.0
// ============================================

class ChatStore {
    constructor() {
        this.histories = {};
        this.activeIds = {};
        this.currentTopic = 'code';
        this.loadFromStorage();
    }

    // ==========================================
    // ЗАГРУЗКА / СОХРАНЕНИЕ
    // ==========================================

    getUserId() {
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        return user?.id || 'anonymous';
    }

    loadFromStorage() {
        const userId = this.getUserId();
        const storageKey = `tg_chat_histories_${userId}`;
        const activeKey = `active_chat_ids_${userId}`;

        try {
            this.histories = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (e) {
            this.histories = {};
        }

        try {
            this.activeIds = JSON.parse(localStorage.getItem(activeKey) || '{}');
        } catch (e) {
            this.activeIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null };
        }

        for (const topic of ['code', 'creative', 'fast', 'kitchen', 'analytics']) {
            if (!this.activeIds[topic]) {
                this.activeIds[topic] = null;
            }
            if (!this.histories[topic]) {
                this.histories[topic] = [];
            }
        }

        console.log(`📁 ChatStore загружен для пользователя ${userId}`);
    }

    saveToStorage() {
        const userId = this.getUserId();
        const storageKey = `tg_chat_histories_${userId}`;
        const activeKey = `active_chat_ids_${userId}`;

        try {
            localStorage.setItem(storageKey, JSON.stringify(this.histories));
            localStorage.setItem(activeKey, JSON.stringify(this.activeIds));
        } catch (e) {
            console.error('❌ Ошибка сохранения ChatStore:', e);
        }
    }

    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ==========================================
    // РАБОТА С ЧАТАМИ
    // ==========================================

    getChats(topicId) {
        if (!topicId) topicId = this.currentTopic;
        return this.histories[topicId] || [];
    }

    getActiveChat(topicId) {
        if (!topicId) topicId = this.currentTopic;
        const chats = this.getChats(topicId);
        const activeId = this.activeIds[topicId];
        return chats.find(c => c.id === activeId) || null;
    }

    setActiveChat(topicId, chatId) {
        if (!topicId) topicId = this.currentTopic;
        this.activeIds[topicId] = chatId;
        this.saveToStorage();
    }

    findChat(chatId) {
        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats) continue;
            const chat = chats.find(c => c.id === chatId);
            if (chat) {
                return { chat, topic };
            }
        }
        return null;
    }

    createChat(topicId, title, options = {}) {
        if (!topicId) topicId = this.currentTopic;

        const sectionName = window.topicNames?.[topicId] || topicId;
        const chatTitle = title || `Новый чат в ${sectionName}`;

        const newChat = {
            id: options.id || this.generateUUID(),
            title: chatTitle,
            maxContext: options.maxContext || 15,
            language: options.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru',
            topic: topicId,
            userRenamed: options.userRenamed || false,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            messages: options.messages || []
        };

        if (!this.histories[topicId]) {
            this.histories[topicId] = [];
        }

        this.histories[topicId].unshift(newChat);
        this.activeIds[topicId] = newChat.id;
        this.saveToStorage();

        console.log(`📝 Создан чат ${newChat.id} в теме ${topicId}`);
        return newChat;
    }

    createTempChat(topicId) {
        if (!topicId) topicId = this.currentTopic;

        const existing = this.histories[topicId]?.find(c =>
            !c.deleted_at && (!c.messages || c.messages.length === 0)
        );

        if (existing) {
            this.activeIds[topicId] = existing.id;
            this.saveToStorage();
            return existing;
        }

        const newChat = this.createChat(topicId, null, {
            messages: []
        });
        this.saveToStorage();
        return newChat;
    }

    updateChat(chatId, data) {
        const found = this.findChat(chatId);
        if (!found) return null;

        const { chat, topic } = found;

        if (data.title !== undefined) chat.title = data.title;
        if (data.maxContext !== undefined) chat.maxContext = data.maxContext;
        if (data.userRenamed !== undefined) chat.userRenamed = data.userRenamed;
        if (data.messages !== undefined) chat.messages = data.messages;

        chat.updated_at = new Date().toISOString();
        this.saveToStorage();
        return chat;
    }

    updateChatId(oldId, newId) {
        const found = this.findChat(oldId);
        if (!found) return false;

        const { chat, topic } = found;

        chat.id = newId;

        const index = this.histories[topic].indexOf(chat);
        if (index !== -1) {
            this.histories[topic][index] = chat;
        }

        if (this.activeIds[topic] === oldId) {
            this.activeIds[topic] = newId;
        }

        this.saveToStorage();
        console.log(`🔄 ID чата обновлён: ${oldId} → ${newId}`);
        return true;
    }

    deleteChat(chatId) {
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat, topic } = found;

        chat.messages = [];
        chat.deleted_at = new Date().toISOString();

        this.histories[topic] = this.histories[topic].filter(c => c.id !== chatId);

        if (this.activeIds[topic] === chatId) {
            const remaining = this.histories[topic];
            this.activeIds[topic] = remaining[0]?.id || null;
        }

        this.saveToStorage();
        console.log(`🗑️ Чат ${chatId} удалён`);
        return true;
    }

    renameChat(chatId, newTitle) {
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat } = found;
        chat.title = newTitle.trim();
        chat.userRenamed = true;
        chat.updated_at = new Date().toISOString();
        this.saveToStorage();
        return chat;
    }

    hasRealMessages(chat) {
        if (!chat || !chat.messages) return false;
        return chat.messages.some(m =>
            (m.type === 'user-msg' || m.type === 'ai-msg') &&
            !m.deleted_at &&
            m.text && m.text.trim().length > 0
        );
    }

    cleanupTempChats() {
        let cleaned = 0;
        const now = new Date();
        const maxAgeMs = 5 * 60 * 1000;

        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats || !Array.isArray(chats)) continue;

            const filtered = chats.filter(chat => {
                if (this.hasRealMessages(chat)) return true;

                const createdAt = new Date(chat.created_at);
                const age = now - createdAt;
                if (age > maxAgeMs) {
                    cleaned++;
                    console.log(`🗑️ Удалён пустой временный чат (${Math.round(age/60000)} мин): ${chat.title}`);
                    return false;
                }
                return true;
            });

            if (filtered.length !== chats.length) {
                this.histories[topic] = filtered;
            }
        }

        if (cleaned > 0) {
            this.saveToStorage();
        }
        return cleaned;
    }

    // ==========================================
    // РАБОТА С СООБЩЕНИЯМИ (УПРОЩЕНО)
    // ==========================================

    addMessage(chatId, text, type, options = {}) {
        const found = this.findChat(chatId);
        if (!found) return null;

        const { chat } = found;

        const newMsg = {
            id: options.id || this.generateUUID(),
            text: text,
            type: type,
            isFavorite: options.isFavorite || false,
            deleted_at: null,
            created_at: options.created_at || new Date().toISOString()
        };

        chat.messages.push(newMsg);
        chat.updated_at = new Date().toISOString();

        // Авто-название для первого сообщения
        if (type === 'user-msg' && !chat.userRenamed) {
            const sectionName = window.topicNames?.[chat.topic] || chat.topic;
            const startTitle = `Новый чат в ${sectionName}`;
            if (chat.title === startTitle || chat.title.includes('Новый чат')) {
                const newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
                chat.title = newTitle;
            }
        }

        this.saveToStorage();
        return newMsg;
    }

    deleteMessage(chatId, messageId) {
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat } = found;
        const msgIndex = chat.messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return false;

        chat.messages.splice(msgIndex, 1);
        chat.updated_at = new Date().toISOString();

        this.saveToStorage();
        console.log(`🗑️ Сообщение ${messageId} удалено`);
        return true;
    }

    toggleFavorite(chatId, messageId) {
        const found = this.findChat(chatId);
        if (!found) return null;

        const { chat } = found;
        const msg = chat.messages.find(m => m.id === messageId);
        if (!msg) return null;

        msg.isFavorite = !msg.isFavorite;
        chat.updated_at = new Date().toISOString();

        this.saveToStorage();
        return msg;
    }

    getFavorites() {
        const favorites = [];

        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats) continue;

            for (const chat of chats) {
                if (!chat.messages) continue;

                for (const msg of chat.messages) {
                    if (msg.isFavorite) {
                        favorites.push({
                            ...msg,
                            chat_id: chat.id,
                            chat_title: chat.title,
                            topic: topic
                        });
                    }
                }
            }
        }

        return favorites;
    }

    getMessages(chatId) {
        const found = this.findChat(chatId);
        if (!found) return [];

        const { chat } = found;
        return chat.messages || [];
    }

    getContextMessages(chatId, maxContext = 15) {
        const messages = this.getMessages(chatId);
        return messages.slice(-maxContext);
    }

    // ==========================================
    // КОРЗИНА (УПРОЩЕНО)
    // ==========================================

    getTrash() {
        const trash = { chats: [], messages: [] };
        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats) continue;
            for (const chat of chats) {
                if (chat.deleted_at) {
                    trash.chats.push(chat);
                }
            }
        }
        // Удаленные сообщения хранятся в чатах, но мы их не показываем
        return trash;
    }

    clearTrash() {
        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats) continue;
            this.histories[topic] = chats.filter(chat => !chat.deleted_at);
        }
        this.saveToStorage();
        console.log('🗑️ Корзина очищена');
    }
}

// Экспорт
window.ChatStore = ChatStore;
window.chatStore = new ChatStore();

console.log('✅ ChatStore v3.0 загружен (упрощенная версия)');
