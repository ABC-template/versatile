// Синхронизация метаданных (список чатов и избранное)
window.syncChatsMetadata = async function() {
    if (!window.config.syncEnabled) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    try {
        const response = await fetch('/api/chats/sync_metadata', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        if (data.syncEnabled && data.chats) {
            if (!window.cloudChatsMeta) window.cloudChatsMeta = {};
            data.chats.forEach(chat => {
                window.cloudChatsMeta[chat.id] = chat;
            });
            if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        }
        if (data.favorites) {
            window.cloudFavorites = data.favorites;
        }
    } catch (err) {
        console.error("Ошибка синхронизации метаданных:", err);
    }
};

// Загрузка полного чата с сервера
window.loadFullChat = async function(chatId) {
    if (!window.config.syncEnabled) return null;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return null;
    try {
        const response = await fetch(`/api/chats/get?id=${chatId}`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        if (data.success && data.chat && data.messages) {
            const topic = data.chat.topic_id;
            if (!window.chatHistories[topic]) window.chatHistories[topic] = [];
            let existingChatIndex = window.chatHistories[topic].findIndex(c => c.id === chatId);
            const fullChat = {
                id: data.chat.id,
                title: data.chat.title,
                maxContext: data.chat.max_context,
                userRenamed: data.chat.user_renamed,
                language: window.tg?.initDataUnsafe?.user?.language_code || 'ru',
                topic: topic,
                messages: data.messages.map(msg => ({
                    id: msg.id,
                    text: msg.text,
                    type: msg.msg_type,
                    isFavorite: msg.is_favorite,
                    synced: true
                }))
            };
            if (existingChatIndex !== -1) {
                window.chatHistories[topic][existingChatIndex] = fullChat;
            } else {
                window.chatHistories[topic].push(fullChat);
            }
            window.saveHistoriesToLocal();
            if (window.activeChatIds[topic] === chatId) {
                window.loadActiveChatMessages();
            }
            return fullChat;
        }
    } catch (err) {
        console.error("Ошибка загрузки чата с сервера:", err);
        return null;
    }
};
