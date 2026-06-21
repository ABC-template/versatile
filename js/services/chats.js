// ============================================
// js/services/chats.js (фрагмент с изменениями)
// ============================================

class ChatService {
    constructor() {
        this.apiClient = window.apiClient;
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // ✅ ИСПРАВЛЕНО: СОЗДАНИЕ ЧАТА
    // ==========================================
    
    async createChat(topicId, title, options = {}) {
        // ✅ Проверяем, есть ли сообщения для отправки
        const hasMessages = options.firstMessage && options.firstMessage.text;
        
        if (!hasMessages) {
            console.warn('⚠️ Попытка создать пустой чат — отклонено');
            return null;
        }
        
        try {
            const data = await this.apiClient.post('/chats/actions/create', {
                action: 'create_chat',
                chat: {
                    topic_id: topicId,
                    title: title || `Чат в ${topicId}`,
                    max_context: options.maxContext || 15,
                    user_renamed: options.userRenamed || false
                },
                firstMessage: options.firstMessage || null
            });
            
            if (data.success) {
                const chat = this.chatStore.createChat(topicId, title, {
                    ...options,
                    synced: true,
                    id: data.chatId
                });
                
                // Если есть первое сообщение, добавляем его
                if (options.firstMessage && data.messageId) {
                    this.chatStore.addMessage(
                        data.chatId,
                        options.firstMessage.text,
                        options.firstMessage.type || 'user-msg',
                        {
                            id: data.messageId,
                            synced: true
                        }
                    );
                }
                
                return chat;
            }
            return null;
        } catch (err) {
            console.error('Create chat error:', err);
            return null;
        }
    }
    
    // ... остальные методы без изменений
}
