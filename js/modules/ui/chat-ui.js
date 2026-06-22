// ============================================
// js/modules/ui/chat-ui.js
// Описание: Интерфейс чата (убрана синхронизация)
// Версия: 2.0.0
// ============================================

class ChatUI {
    constructor() {
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.uiRenderer = window.uiRenderer;
        this.chatService = window.chatService;
        this._isRestoring = false;
    }
    
    // ==========================================
    // ЗАГРУЗКА СООБЩЕНИЙ
    // ==========================================
    
    loadActiveChatMessages() {
        const container = document.getElementById('chat-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) {
            this.showWelcomeMessage();
            return;
        }
        
        const messages = this.chatStore.getMessages(activeChat.id);
        if (messages.length === 0) {
            this.showWelcomeMessage();
            return;
        }
        
        for (const msg of messages) {
            this.uiRenderer.renderMessage(
                msg.text,
                msg.type,
                msg.id,
                msg.isFavorite
            );
        }
    }
    
    showWelcomeMessage() {
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) return;
        
        const welcomeTexts = window.welcomeTexts || {};
        const text = welcomeTexts[activeChat.topic] || 'Привет! Чем могу помочь?';
        this.uiRenderer.renderWelcome(text);
    }
    
    // ==========================================
    // ПЕРЕКЛЮЧЕНИЕ ЧАТА (С ПРОВЕРКОЙ ВЕРСИИ)
    // ==========================================
    
// ==========================================
// ПЕРЕКЛЮЧЕНИЕ ЧАТА (С ПРОВЕРКОЙ ВЕРСИИ)
// ==========================================

async switchToChat(chatId, topic) {
    this.deleteEmptyCurrentChat();
    
    const card = document.getElementById('profile-card');
    if (card) card.classList.add('hidden');
    
    if (window.tg?.BackButton) window.tg.BackButton.hide();
    
    if (this.chatStore.currentTopic !== topic) {
        this.chatStore.currentTopic = topic;
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
    }
    
    this.chatStore.setActiveChat(topic, chatId);
    
    // ✅ ИСПРАВЛЕНО: обрабатываем ошибку открытия чата
    if (this.userStore.canSync() && this.chatService) {
        try {
            const updated = await this.chatService.openChat(chatId);
            if (updated) {
                console.log(`🔄 Чат ${chatId} обновлён`);
            }
        } catch (err) {
            console.warn(`⚠️ Не удалось обновить чат ${chatId}, использую локальную версию`);
        }
    }
    
    this.refreshUI();
    this.showChatInterface();
}
    
    async switchTopic(topic) {
        this.deleteEmptyCurrentChat();
        
        this.chatStore.currentTopic = topic;
        
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
        
        const newChat = this.chatStore.createTempChat(topic);
        newChat.synced = false;
        this.chatStore.saveToStorage();
        
        this.refreshUI();
        this.showChatInterface();
    }
    
    // ==========================================
    // УДАЛЕНИЕ ПУСТОГО ТЕКУЩЕГО ЧАТА
    // ==========================================
    
    deleteEmptyCurrentChat() {
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) return false;
        
        if (this.chatStore.hasRealMessages(activeChat)) {
            return false;
        }
        
        if (activeChat.synced) {
            console.warn(`⚠️ Обнаружен синхронизированный пустой чат ${activeChat.id}, удаляем локально`);
        }
        
        const topic = activeChat.topic || this.chatStore.currentTopic;
        this.chatStore.deleteChat(activeChat.id);
        
        const newChat = this.chatStore.createTempChat(topic);
        newChat.synced = false;
        this.chatStore.saveToStorage();
        
        console.log(`🗑️ Пустой чат ${activeChat.id} удалён`);
        return true;
    }
    
    // ==========================================
    // ОЧИСТКА ВСЕХ ПУСТЫХ ЧАТОВ
    // ==========================================
    
    cleanupAllEmptyChats() {
        let cleaned = 0;
        const allChats = [];
        
        for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
            if (!chats || !Array.isArray(chats)) continue;
            for (const chat of chats) {
                allChats.push({ chat, topic });
            }
        }
        
        for (const { chat, topic } of allChats) {
            if (!this.chatStore.hasRealMessages(chat)) {
                const topicChats = this.chatStore.getChats(topic);
                if (topicChats.length <= 1) {
                    continue;
                }
                
                if (chat.synced) {
                    console.warn(`⚠️ Удаляем синхронизированный пустой чат ${chat.id}`);
                }
                
                this.chatStore.deleteChat(chat.id);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.chatStore.saveToStorage();
            console.log(`🧹 Очищено ${cleaned} пустых чатов`);
        }
        
        return cleaned;
    }
    
    // ==========================================
    // ИНТЕРФЕЙС
    // ==========================================
    
    showChatInterface() {
        const tagsCloud = document.getElementById('tags-cloud-container');
        const chatContainer = document.getElementById('chat-container');
        const inputArea = document.getElementById('input-area');
        const fabBtn = document.getElementById('fab-open-input');
        const header = document.getElementById('header');
        
        if (tagsCloud) tagsCloud.style.display = 'none';
        if (chatContainer) {
            chatContainer.style.display = 'flex';
            chatContainer.classList.add('visible');
        }
        if (inputArea) inputArea.style.display = 'flex';
        if (fabBtn) fabBtn.style.display = 'flex';
        if (header) header.classList.remove('hidden');
    }
    
    showTagsCloud() {
        this.deleteEmptyCurrentChat();
        
        const tagsCloud = document.getElementById('tags-cloud-container');
        const chatContainer = document.getElementById('chat-container');
        const inputArea = document.getElementById('input-area');
        const fabBtn = document.getElementById('fab-open-input');
        const header = document.getElementById('header');
        
        if (tagsCloud) tagsCloud.style.display = 'flex';
        if (chatContainer) {
            chatContainer.style.display = 'none';
            chatContainer.classList.remove('visible');
        }
        if (inputArea) inputArea.style.display = 'none';
        if (fabBtn) fabBtn.style.display = 'none';
        
        if (header) header.classList.remove('hidden');
        
        if (this.uiRenderer) {
            this.uiRenderer.renderTagsCloud();
        }
    }
    
    refreshUI() {
        if (window.applyUiLocalization) window.applyUiLocalization();
        this.loadActiveChatMessages();
        
        if (window.profileUI) {
            window.profileUI.renderHistoryChatsList(window.currentFilter || 'all');
        }
        
        if (window.profileUI) {
            window.profileUI.syncContextSliderWithActiveChat();
        }
    }
    
    // ==========================================
    // НОВЫЙ ЧАТ
    // ==========================================
    
    createNewChat() {
        this.deleteEmptyCurrentChat();
        
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        const newChat = this.chatStore.createTempChat();
        newChat.synced = false;
        this.chatStore.saveToStorage();
        
        this.showChatInterface();
        this.refreshUI();
        return newChat;
    }
    
    // ==========================================
    // СОХРАНЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    saveLastChat() {
        const activeChat = this.chatStore.getActiveChat();
        if (activeChat && activeChat.synced && this.chatStore.hasRealMessages(activeChat)) {
            localStorage.setItem('last_topic', this.chatStore.currentTopic);
            localStorage.setItem(`last_chat_${this.chatStore.currentTopic}`, activeChat.id);
        } else {
            localStorage.removeItem('last_topic');
            const topic = this.chatStore.currentTopic;
            localStorage.removeItem(`last_chat_${topic}`);
        }
    }
    
    // ==========================================
    // ВОССТАНОВЛЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    restoreLastChat() {
        if (this._isRestoring) return false;
        this._isRestoring = true;
        
        try {
            const lastTopic = localStorage.getItem('last_topic');
            if (!lastTopic) return false;
            
            const lastChatId = localStorage.getItem(`last_chat_${lastTopic}`);
            if (!lastChatId) return false;
            
            const found = this.chatStore.findChat(lastChatId);
            if (!found) return false;
            
            const chat = found.chat;
            
            if (chat && !chat.deleted_at && this.chatStore.hasRealMessages(chat)) {
                this.chatStore.currentTopic = lastTopic;
                this.chatStore.setActiveChat(lastTopic, lastChatId);
                return true;
            }
            
            if (chat && !this.chatStore.hasRealMessages(chat)) {
                this.chatStore.deleteChat(lastChatId);
                localStorage.removeItem(`last_chat_${lastTopic}`);
                console.log(`🗑️ Удалён пустой чат ${lastChatId} при восстановлении`);
            }
            
            return false;
        } finally {
            this._isRestoring = false;
        }
    }
    
    cleanupTempChats() {
        return this.cleanupAllEmptyChats();
    }
}

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ==========================================

window.ChatUI = ChatUI;
window.chatUI = new ChatUI();

window.getCurrentActiveChat = function() {
    if (window.chatStore) {
        return window.chatStore.getActiveChat();
    }
    return null;
};

window.handleTagClick = function(topic) {
    if (window.chatUI) {
        window.chatUI.switchTopic(topic);
    }
};

window.renameChat = function(event, chatId) {
    if (event) event.stopPropagation();
    const found = window.chatStore.findChat(chatId);
    if (!found) return;
    const { chat } = found;
    const newTitle = prompt('Введите новое название:', chat.title);
    if (newTitle && newTitle.trim().length > 0) {
        if (window.chatService) {
            window.chatService.renameChat(chatId, newTitle.trim());
            window.chatUI.refreshUI();
        }
    }
};

window.deleteChat = function(event, chatId) {
    if (event) event.stopPropagation();
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_chat') : 'Удалить чат?';
    const action = () => {
        if (window.chatService) {
            window.chatService.deleteChat(chatId);
            window.chatUI.refreshUI();
        }
    };
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

console.log('✅ ChatUI v2.0 загружен');
