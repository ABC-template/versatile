// ============================================
// js/store/ChatStore.js
// Описание: Управление чатами, сообщениями, версиями и корзиной
// Версия: 2.0.1 (добавлен createTempChat)
// ============================================

class ChatStore {
    constructor() {
        this.histories = {};
        this.activeIds = {};
        this.currentTopic = 'code';
        this.chatVersions = {}; // { chatId: timestamp }
        this.trash = { chats: [], messages: [] }; // Локальный кеш корзины
        this.loadFromStorage();
    }

    // ==========================================
    // ЗАГРУЗКА / СОХРАНЕНИЕ
    // ==========================================

    getUserId() {
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        return user?.id || 'anonymous';
    }

    getStorageKey(type) {
        const userId = this.getUserId();
        const keys = {
            histories: `tg_chat_histories_${userId}`,
            active: `active_chat_ids_${userId}`,
            versions: `chat_versions_${userId}`,
            trash: `trash_cache_${userId}`
        };
        return keys[type];
    }

    loadFromStorage() {
        try {
            const histories = localStorage.getItem(this.getStorageKey('histories'));
            this.histories = histories ? JSON.parse(histories) : {};

            const active = localStorage.getItem(this.getStorageKey('active'));
            this.activeIds = active ? JSON.parse(active) : {};

            const versions = localStorage.getItem(this.getStorageKey('versions'));
            this.chatVersions = versions ? JSON.parse(versions) : {};

            const trash = localStorage.getItem(this.getStorageKey('trash'));
            this.trash = trash ? JSON.parse(trash) : { chats: [], messages: [] };

            // Инициализация топиков
            for (const topic of ['code', 'creative', 'fast', 'kitchen', 'analytics']) {
                if (!this.activeIds[topic]) {
                    this.activeIds[topic] = null;
                }
                if (!this.histories[topic]) {
                    this.histories[topic] = [];
                }
            }
        } catch (e) {
            console.error('❌ Ошибка загрузки ChatStore:', e);
            this.histories = {};
            this.activeIds = {};
            this.chatVersions = {};
            this.trash = { chats: [], messages: [] };
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem(this.getStorageKey('histories'), JSON.stringify(this.histories));
            localStorage.setItem(this.getStorageKey('active'), JSON.stringify(this.activeIds));
            localStorage.setItem(this.getStorageKey('versions'), JSON.stringify(this.chatVersions));
            localStorage.setItem(this.getStorageKey('trash'), JSON.stringify(this.trash));
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
    // ВЕРСИОННОСТЬ
    // ==========================================

    getVersion(chatId) {
        return this.chatVersions[chatId] || null;
    }

    setVersion(chatId, version) {
        if (!chatId || !version) return;
        this.chatVersions[chatId] = version;
        this.saveToStorage();
    }

    updateMetadata(metadata) {
        if (!metadata || !Array.isArray(metadata)) return;
        
        for (const item of metadata) {
            if (item.id && item.version) {
                this.chatVersions[item.id] = item.version;
            }
        }
        this.saveToStorage();
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
        if (!chatId) return null;
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
            synced: options.synced || false,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            messages: options.messages || []
        };

        // Устанавливаем версию
        const version = new Date().toISOString();
        this.chatVersions[newChat.id] = version;

        if (!this.histories[topicId]) {
            this.histories[topicId] = [];
        }

        this.histories[topicId].unshift(newChat);
        this.activeIds[topicId] = newChat.id;
        this.saveToStorage();

        console.log(`📝 Создан чат ${newChat.id} в теме ${topicId}, version: ${version}`);
        return newChat;
    }

    // ==========================================
    // СОЗДАНИЕ ВРЕМЕННОГО ЧАТА (ДОБАВЛЕНО)
    // ==========================================
    
    createTempChat(topicId) {
        if (!topicId) topicId = this.currentTopic;
        
        // Проверяем, есть ли уже пустой несинхронизированный чат
        const existing = this.histories[topicId]?.find(c => 
            !c.synced && !c.deleted_at && (!c.messages || c.messages.length === 0)
        );
        
        if (existing) {
            this.activeIds[topicId] = existing.id;
            this.saveToStorage();
            return existing;
        }
        
        // Создаем новый временный чат
        const newChat = this.createChat(topicId, null, { 
            synced: false,
            messages: []
        });
        newChat.synced = false;
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
        if (data.synced !== undefined) chat.synced = data.synced;
        if (data.messages !== undefined) chat.messages = data.messages;

        chat.updated_at = new Date().toISOString();
        
        // Обновляем версию
        const version = chat.updated_at;
        this.chatVersions[chatId] = version;

        this.saveToStorage();
        console.log(`🔄 Чат ${chatId} обновлён, version: ${version}`);
        return chat;
    }

    deleteChat(chatId) {
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat, topic } = found;

        // Сохраняем в корзину перед удалением
        this.addToTrash('chat', {
            ...chat,
            deleted_at: new Date().toISOString()
        });

        // Очищаем сообщения
        chat.messages = [];
        chat.deleted_at = new Date().toISOString();

        // Удаляем из истории
        this.histories[topic] = this.histories[topic].filter(c => c.id !== chatId);

        // Удаляем версию
        delete this.chatVersions[chatId];

        // Обновляем активный чат
        if (this.activeIds[topic] === chatId) {
            const remaining = this.histories[topic];
            this.activeIds[topic] = remaining[0]?.id || null;
        }

        this.saveToStorage();
        console.log(`🗑️ Чат ${chatId} удалён и перемещён в корзину`);
        return true;
    }

    restoreChat(chatId) {
        const trashItem = this.trash.chats.find(c => c.id === chatId);
        if (!trashItem) return false;

        // Удаляем из корзины
        this.trash.chats = this.trash.chats.filter(c => c.id !== chatId);

        // Восстанавливаем чат
        const topic = trashItem.topic || 'code';
        if (!this.histories[topic]) {
            this.histories[topic] = [];
        }

        trashItem.deleted_at = null;
        trashItem.updated_at = new Date().toISOString();
        trashItem.messages = []; // Сообщения не восстанавливаем (только чат)

        this.histories[topic].unshift(trashItem);
        this.activeIds[topic] = trashItem.id;

        // Восстанавливаем версию
        this.chatVersions[chatId] = trashItem.updated_at;

        this.saveToStorage();
        console.log(`♻️ Чат ${chatId} восстановлен из корзины`);
        return true;
    }

    renameChat(chatId, newTitle) {
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat } = found;
        chat.title = newTitle.trim();
        chat.userRenamed = true;
        chat.updated_at = new Date().toISOString();
        
        // Обновляем версию
        this.chatVersions[chatId] = chat.updated_at;

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

    // ==========================================
    // РАБОТА С СООБЩЕНИЯМИ
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
            synced: options.synced || false,
            deleted_at: null,
            created_at: options.created_at || new Date().toISOString()
        };

        chat.messages.push(newMsg);
        chat.updated_at = new Date().toISOString();

        // Обновляем версию чата
        this.chatVersions[chatId] = chat.updated_at;

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

        const msg = chat.messages[msgIndex];
        
        // Сохраняем в корзину
        this.addToTrash('message', {
            ...msg,
            chat_id: chatId,
            chat_title: chat.title,
            deleted_at: new Date().toISOString()
        });

        // Удаляем из чата
        chat.messages.splice(msgIndex, 1);
        chat.updated_at = new Date().toISOString();

        // Обновляем версию
        this.chatVersions[chatId] = chat.updated_at;

        this.saveToStorage();
        console.log(`🗑️ Сообщение ${messageId} удалено и перемещено в корзину`);
        return true;
    }

    restoreMessage(messageId) {
        const trashItem = this.trash.messages.find(m => m.id === messageId);
        if (!trashItem) return false;

        const chatId = trashItem.chat_id;
        const found = this.findChat(chatId);
        if (!found) return false;

        const { chat } = found;

        // Проверяем, не существует ли уже такое сообщение
        const exists = chat.messages.some(m => m.id === messageId);
        if (exists) return false;

        // Восстанавливаем сообщение
        const restoredMsg = {
            id: trashItem.id,
            text: trashItem.text,
            type: trashItem.type,
            isFavorite: trashItem.isFavorite || false,
            synced: false,
            deleted_at: null,
            created_at: trashItem.created_at || new Date().toISOString()
        };

        chat.messages.push(restoredMsg);
        chat.updated_at = new Date().toISOString();

        // Обновляем версию
        this.chatVersions[chatId] = chat.updated_at;

        // Удаляем из корзины
        this.trash.messages = this.trash.messages.filter(m => m.id !== messageId);

        // Сортируем сообщения по дате
        chat.messages.sort((a, b) => {
            return new Date(a.created_at) - new Date(b.created_at);
        });

        this.saveToStorage();
        console.log(`♻️ Сообщение ${messageId} восстановлено из корзины`);
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

        // Обновляем версию
        this.chatVersions[chatId] = chat.updated_at;

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

    markMessagesSynced(chatId, messageIds) {
        const found = this.findChat(chatId);
        if (!found) return;

        const { chat } = found;
        let updated = false;

        for (const msg of chat.messages) {
            if (messageIds.includes(msg.id) && !msg.synced) {
                msg.synced = true;
                updated = true;
            }
        }

        if (updated) {
            chat.updated_at = new Date().toISOString();
            this.chatVersions[chatId] = chat.updated_at;
            this.saveToStorage();
            console.log(`✅ Сообщения ${messageIds.join(', ')} помечены как синхронизированные`);
        }
    }

    syncFromCloud(cloudChat, topicId) {
        if (!topicId) topicId = cloudChat.topic_id || this.currentTopic;

        const localChats = this.histories[topicId] || [];
        let existingIndex = localChats.findIndex(c => c.id === cloudChat.id);

        // Формируем облачные сообщения (только не удалённые)
        const cloudMessages = (cloudChat.messages || [])
            .filter(msg => !msg.deleted_at)
            .map(msg => ({
                id: msg.id,
                text: msg.text,
                type: msg.msg_type || msg.type,
                isFavorite: msg.is_favorite || false,
                synced: true,
                deleted_at: null,
                created_at: msg.created_at || new Date().toISOString()
            }));

        const cloudMsgIds = new Set(cloudMessages.map(m => m.id));

        let finalMessages = [...cloudMessages];

        if (existingIndex !== -1) {
            const localChat = localChats[existingIndex];

            // Добавляем несинхронизированные локальные сообщения
            for (const localMsg of (localChat.messages || [])) {
                if (!localMsg.synced && !cloudMsgIds.has(localMsg.id)) {
                    finalMessages.push({
                        ...localMsg,
                        synced: false
                    });
                }
            }

            // Сортируем по дате
            finalMessages.sort((a, b) => {
                return new Date(a.created_at) - new Date(b.created_at);
            });

            const syncedChat = {
                id: cloudChat.id,
                title: cloudChat.title,
                maxContext: cloudChat.max_context || 15,
                userRenamed: cloudChat.user_renamed || false,
                language: cloudChat.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru',
                topic: topicId,
                synced: true,
                deleted_at: null,
                updated_at: cloudChat.updated_at || new Date().toISOString(),
                created_at: cloudChat.created_at || new Date().toISOString(),
                messages: finalMessages
            };

            this.histories[topicId][existingIndex] = syncedChat;
            
            // Обновляем версию
            if (cloudChat.version) {
                this.chatVersions[cloudChat.id] = cloudChat.version;
            } else {
                this.chatVersions[cloudChat.id] = syncedChat.updated_at;
            }

            console.log(`🔄 Чат ${cloudChat.id} обновлён из облака (${finalMessages.length} сообщений)`);

        } else {
            if (!this.histories[topicId]) {
                this.histories[topicId] = [];
            }

            const syncedChat = {
                id: cloudChat.id,
                title: cloudChat.title,
                maxContext: cloudChat.max_context || 15,
                userRenamed: cloudChat.user_renamed || false,
                language: cloudChat.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru',
                topic: topicId,
                synced: true,
                deleted_at: null,
                updated_at: cloudChat.updated_at || new Date().toISOString(),
                created_at: cloudChat.created_at || new Date().toISOString(),
                messages: finalMessages
            };

            this.histories[topicId].push(syncedChat);
            
            // Устанавливаем версию
            if (cloudChat.version) {
                this.chatVersions[cloudChat.id] = cloudChat.version;
            } else {
                this.chatVersions[cloudChat.id] = syncedChat.updated_at;
            }

            console.log(`📥 Новый чат ${cloudChat.id} загружен из облака (${finalMessages.length} сообщений)`);
        }

        this.saveToStorage();
        return this.findChat(cloudChat.id)?.chat || null;
    }

    // ==========================================
    // КОРЗИНА (интегрированная)
    // ==========================================

    addToTrash(type, item) {
        if (type === 'chat') {
            // Проверяем, нет ли уже такого чата в корзине
            const exists = this.trash.chats.some(c => c.id === item.id);
            if (!exists) {
                this.trash.chats.push(item);
                // Ограничиваем размер корзины (100 элементов)
                if (this.trash.chats.length > 100) {
                    this.trash.chats.shift();
                }
            }
        } else if (type === 'message') {
            const exists = this.trash.messages.some(m => m.id === item.id);
            if (!exists) {
                this.trash.messages.push(item);
                if (this.trash.messages.length > 500) {
                    this.trash.messages.shift();
                }
            }
        }
        this.saveToStorage();
    }

    getTrash() {
        return this.trash;
    }

    clearTrash() {
        this.trash = { chats: [], messages: [] };
        this.saveToStorage();
        console.log('🗑️ Корзина полностью очищена');
    }

    getTrashCount() {
        return this.trash.chats.length + this.trash.messages.length;
    }

    // ==========================================
    // ОЧИСТКА ВРЕМЕННЫХ ЧАТОВ
    // ==========================================

    cleanupTempChats() {
        let cleaned = 0;
        const now = new Date();
        const maxAgeMs = 5 * 60 * 1000;

        for (const [topic, chats] of Object.entries(this.histories || {})) {
            if (!chats || !Array.isArray(chats)) continue;

            const filtered = chats.filter(chat => {
                if (chat.synced) return true;
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

        // Обновляем версию
        if (this.chatVersions[oldId]) {
            this.chatVersions[newId] = this.chatVersions[oldId];
            delete this.chatVersions[oldId];
        }

        this.saveToStorage();
        console.log(`🔄 ID чата обновлён: ${oldId} → ${newId}`);
        return true;
    }
}

// Экспорт
window.ChatStore = ChatStore;
window.chatStore = new ChatStore();

console.log('✅ ChatStore v2.0.1 загружен (с createTempChat)');
