// js/modules/sync/pending-handler.js

// Получение списка ID для удаления на этом устройстве
window.fetchPendingDeletions = async function() {
    if (!window.config?.syncEnabled) return [];
    
    const deviceFingerprint = window.getDeviceFingerprint();
    if (!deviceFingerprint) return [];
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return [];
    
    try {
        const response = await fetch(`/api/sync/pending?device=${encodeURIComponent(deviceFingerprint)}`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        
        const data = await response.json();
        
        if (data.success && data.pending) {
            console.log(`📋 Получено ${data.pending.length} элементов для удаления`);
            return data.pending;
        }
        return [];
    } catch (err) {
        console.error("Ошибка получения pending списка:", err);
        return [];
    }
};

// Подтверждение удаления на сервере
window.confirmPendingDeletion = async function(id, deviceFingerprint) {
    if (!window.config?.syncEnabled) return false;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return false;
    
    try {
        const response = await fetch('/api/sync/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ id, deviceFingerprint })
        });
        
        const data = await response.json();
        return data.success === true;
    } catch (err) {
        console.error("Ошибка подтверждения удаления:", err);
        return false;
    }
};

// Удаление локальных чатов/сообщений по списку pending
window.processPendingDeletions = async function() {
    const pending = await window.fetchPendingDeletions();
    
    if (pending.length === 0) return;
    
    console.log(`🗑️ Обработка ${pending.length} удаленных элементов...`);
    
    const deviceFingerprint = window.getDeviceFingerprint();
    
    for (const item of pending) {
        // Удаляем локальную копию
        if (item.entity_type === 'chat') {
            // Удаляем чат из всех тем
            for (const topic of ['code', 'creative', 'fast', 'kitchen']) {
                if (window.chatHistories[topic]) {
                    const index = window.chatHistories[topic].findIndex(c => c.id === item.id);
                    if (index !== -1) {
                        window.chatHistories[topic].splice(index, 1);
                        console.log(`🗑️ Удален локальный чат ${item.id}`);
                    }
                }
            }
        } else if (item.entity_type === 'message') {
            // Удаляем сообщение из чата
            for (const topic of ['code', 'creative', 'fast', 'kitchen']) {
                if (window.chatHistories[topic]) {
                    for (const chat of window.chatHistories[topic]) {
                        const msgIndex = chat.messages.findIndex(m => m.id === item.id);
                        if (msgIndex !== -1) {
                            chat.messages.splice(msgIndex, 1);
                            console.log(`🗑️ Удалено локальное сообщение ${item.id}`);
                            break;
                        }
                    }
                }
            }
        }
        
        // Подтверждаем удаление на сервере
        await window.confirmPendingDeletion(item.id, deviceFingerprint);
    }
    
    // Сохраняем изменения
    window.saveHistoriesToLocal();
    
    // Обновляем UI если нужно
    if (typeof window.loadActiveChatMessages === 'function') {
        window.loadActiveChatMessages();
    }
    if (typeof window.renderHistoryChatsList === 'function') {
        window.renderHistoryChatsList();
    }
    
    console.log("✅ Обработка pending удалений завершена");
};

// Интеграция в полную синхронизацию
// Добавить в конец fullSyncAllChats:
// await window.processPendingDeletions();
