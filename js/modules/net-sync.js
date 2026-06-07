window.syncChatsMetadata = async function() {
    if (!window.config.syncEnabled) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    try {
        const response = await fetch('/api/chats/sync-metadata', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        if (data.syncEnabled && data.chats) {
            // Обновляем глобальные структуры
            if (!window.cloudChatsMeta) window.cloudChatsMeta = {};
            data.chats.forEach(chat => {
                window.cloudChatsMeta[chat.id] = chat;
            });
            // Здесь можно обновить список чатов в UI
            if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
        }
        if (data.favorites) {
            window.cloudFavorites = data.favorites;
            // Обновим isFavorite у локальных сообщений, если нужно
        }
    } catch (err) {
        console.error("Ошибка синхронизации метаданных:", err);
    }
};
