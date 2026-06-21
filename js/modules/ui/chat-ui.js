// ============================================
// js/modules/ui/chat-ui.js
// Описание: Интерфейс чата
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
    // ПЕРЕКЛЮЧЕНИЕ ЧАТА
    // ==========================================
    
    switchToChat(chatId, topic) {
        // ✅ Перед переключением удаляем пустой чат
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
        this.refreshUI();
        this.showChatInterface();
    }
    
    /**
     * ✅ НОВОЕ: Переключение топика с мгновенным удалением пустого чата
     */
    switchTopic(topic) {
        // ✅ Удаляем пустой чат сразу при переключении
        this.deleteEmptyCurrentChat();
        
        this.chatStore.currentTopic = topic;
        
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
        
        // Создаем новый временный чат (пустой, без синхронизации)
        const newChat = this.chatStore.createTempChat(topic);
        // ✅ Важно: новый чат НЕ СИНХРОНИЗИРУЕТСЯ, пока нет сообщений
        newChat.synced = false;
        this.chatStore.saveToStorage();
        
        this.refreshUI();
        this.showChatInterface();
    }
    
    // ==========================================
    // ✅ НОВОЕ: Удаление пустого текущего чата
    // ==========================================
    
    deleteEmptyCurrentChat() {
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) return false;
        
        // Проверяем, есть ли реальные сообщения
        if (this.chatStore.hasRealMessages(activeChat)) {
            return false;
        }
        
        // Проверяем, синхронизирован ли чат
        if (activeChat.synced) {
            // Если синхронизирован, но пустой — это баг, удаляем локально
            console.warn(`⚠️ Обнаружен синхронизированный пустой чат ${activeChat.id}, удаляем локально`);
        }
        
        // Удаляем чат
        const topic = activeChat.topic || this.chatStore.currentTopic;
        this.chatStore.deleteChat(activeChat.id);
        
        // Создаем новый пустой чат вместо удаленного
        const newChat = this.chatStore.createTempChat(topic);
        newChat.synced = false;
        this.chatStore.saveToStorage();
        
        console.log(`🗑️ Пустой чат ${activeChat.id} удалён при переключении`);
        return true;
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
        // ✅ При показе облака тэгов удаляем пустой чат
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
        // ✅ Удаляем пустой чат перед созданием нового
        this.deleteEmptyCurrentChat();
        
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        const newChat = this.chatStore.createTempChat();
        // ✅ Новый чат НЕ СИНХРОНИЗИРУЕТСЯ
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
        // ✅ Сохраняем только если есть сообщения и чат синхронизирован
        if (activeChat && activeChat.synced && this.chatStore.hasRealMessages(activeChat)) {
            localStorage.setItem('last_topic', this.chatStore.currentTopic);
            localStorage.setItem(`last_chat_${this.chatStore.currentTopic}`, activeChat.id);
        } else {
            // Очищаем сохранение, если чат пустой
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
            
            // ✅ Восстанавливаем только чаты с реальными сообщениями
            if (chat && !chat.deleted_at && this.chatStore.hasRealMessages(chat)) {
                this.chatStore.currentTopic = lastTopic;
                this.chatStore.setActiveChat(lastTopic, lastChatId);
                return true;
            }
            
            // Если чат пустой — удаляем его
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
    
    // ==========================================
    // ✅ НОВОЕ: Очистка ВСЕХ пустых чатов
    // ==========================================
    
    cleanupAllEmptyChats() {
        let cleaned = 0;
        const allChats = [];
        
        // Собираем все чаты
        for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
            if (!chats || !Array.isArray(chats)) continue;
            for (const chat of chats) {
                allChats.push({ chat, topic });
            }
        }
        
        // Удаляем пустые
        for (const { chat, topic } of allChats) {
            if (!this.chatStore.hasRealMessages(chat)) {
                // Проверяем, не является ли это единственным чатом в топике
                const topicChats = this.chatStore.getChats(topic);
                if (topicChats.length <= 1) {
                    // Если это единственный чат — не удаляем, оставляем как заглушку
                    continue;
                }
                
                // Если чат синхронизирован, но пустой — это баг, удаляем
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
    // ОЧИСТКА ВРЕМЕННЫХ ЧАТОВ (устаревший метод, оставлен для совместимости)
    // ==========================================
    
    cleanupTempChats() {
        // ✅ Используем новый метод
        return this.cleanupAllEmptyChats();
    }
}

// Экспортируем как глобальный объект
window.ChatUI = ChatUI;
window.chatUI = new ChatUI();

// ... остальные обертки без изменений
