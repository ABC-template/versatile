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
    
    switchTopic(topic) {
        // Удаляем пустой временный чат при переключении
        const currentChat = this.chatStore.getActiveChat();
        if (currentChat && !currentChat.synced && !this.chatStore.hasRealMessages(currentChat)) {
            const topicChats = this.chatStore.getChats(this.chatStore.currentTopic);
            this.chatStore.histories[this.chatStore.currentTopic] = topicChats.filter(c => c.id !== currentChat.id);
            this.chatStore.activeIds[this.chatStore.currentTopic] = null;
        }
        
        this.chatStore.currentTopic = topic;
        
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
        
        this.chatStore.createTempChat(topic);
        this.refreshUI();
        this.showChatInterface();
    }
    
    // ==========================================
    // ИНТЕРФЕЙС
    // ==========================================
    
    showChatInterface() {
        const tagsCloud = document.getElementById('tags-cloud-container');
        const chatContainer = document.getElementById('chat-container');
        const inputArea = document.getElementById('input-area');
        const fabBtn = document.getElementById('fab-open-input');
        
        if (tagsCloud) tagsCloud.style.display = 'none';
        if (chatContainer) {
            chatContainer.style.display = 'flex';
            chatContainer.classList.add('visible');
        }
        if (inputArea) inputArea.style.display = 'flex';
        if (fabBtn) fabBtn.style.display = 'flex';
    }
    
    showTagsCloud() {
        const tagsCloud = document.getElementById('tags-cloud-container');
        const chatContainer = document.getElementById('chat-container');
        const inputArea = document.getElementById('input-area');
        const fabBtn = document.getElementById('fab-open-input');
        
        if (tagsCloud) tagsCloud.style.display = 'flex';
        if (chatContainer) {
            chatContainer.style.display = 'none';
            chatContainer.classList.remove('visible');
        }
        if (inputArea) inputArea.style.display = 'none';
        if (fabBtn) fabBtn.style.display = 'none';
    }
    
    refreshUI() {
        // Обновляем локаль
        if (window.applyUiLocalization) window.applyUiLocalization();
        
        // Загружаем сообщения
        this.loadActiveChatMessages();
        
        // Обновляем историю чатов
        if (window.renderHistoryChatsList) {
            window.renderHistoryChatsList(window.currentFilter || 'all');
        }
        
        // Обновляем контекст
        if (window.syncContextSliderWithActiveChat) {
            window.syncContextSliderWithActiveChat();
        }
        
        // Обновляем облако тегов
        if (window.renderTagsCloud) {
            window.renderTagsCloud();
        }
    }
    
    // ==========================================
    // НОВЫЙ ЧАТ
    // ==========================================
    
    createNewChat() {
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        const newChat = this.chatStore.createTempChat();
        this.showChatInterface();
        this.refreshUI();
        return newChat;
    }
    
    // ==========================================
    // СОХРАНЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    saveLastChat() {
        const activeChat = this.chatStore.getActiveChat();
        if (activeChat && activeChat.synced) {
            localStorage.setItem('last_topic', this.chatStore.currentTopic);
            localStorage.setItem(`last_chat_${this.chatStore.currentTopic}`, activeChat.id);
        }
    }
    
    // ==========================================
    // ВОССТАНОВЛЕНИЕ ПОСЛЕДНЕГО ЧАТА
    // ==========================================
    
    restoreLastChat() {
        const lastTopic = localStorage.getItem('last_topic');
        if (!lastTopic) return false;
        
        const lastChatId = localStorage.getItem(`last_chat_${lastTopic}`);
        if (!lastChatId) return false;
        
        const chat = this.chatStore.findChat(lastChatId)?.chat;
        if (chat && !chat.deleted_at && this.chatStore.hasRealMessages(chat)) {
            this.chatStore.currentTopic = lastTopic;
            this.chatStore.setActiveChat(lastTopic, lastChatId);
            return true;
        }
        
        return false;
    }
    
    // ==========================================
    // ОЧИСТКА ВРЕМЕННЫХ ЧАТОВ
    // ==========================================
    
    cleanupTempChats() {
        const cleaned = this.chatStore.cleanupTempChats();
        if (cleaned > 0) {
            console.log(`🧹 Очищено ${cleaned} пустых временных чатов`);
        }
        return cleaned;
    }
}

// Экспортируем как глобальный объект
window.ChatUI = ChatUI;
window.chatUI = new ChatUI();

console.log('✅ ChatUI загружен');
