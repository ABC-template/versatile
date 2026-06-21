// ============================================
// js/modules/sync/pending-handler.js
// Описание: Обработка отложенных удалений
// ============================================

console.log('✅ PendingHandler загружен');

/**
 * Получение списка ID для удаления на этом устройстве
 */
window.fetchPendingDeletions = async function() {
    if (!window.userStore?.canSync()) return [];
    
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
        console.error('Ошибка получения pending списка:', err);
        return [];
    }
};

/**
 * ✅ ИСПРАВЛЕНО: Подтверждение удаления на сервере с проверкой на дубликаты
 */
window.confirmPendingDeletion = async function(id, deviceFingerprint) {
    if (!window.userStore?.canSync()) return false;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return false;
    
    try {
        // ✅ ИСПРАВЛЕНО: Проверяем, не подтверждено ли уже
        const cached = localStorage.getItem(`pending_confirmed_${id}`);
        if (cached === deviceFingerprint) {
            console.log(`⚠️ Удаление ${id} уже подтверждено этим устройством`);
            return true;
        }
        
        const response = await fetch('/api/sync/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ id, deviceFingerprint })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // ✅ ИСПРАВЛЕНО: Кешируем подтверждение
            localStorage.setItem(`pending_confirmed_${id}`, deviceFingerprint);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Ошибка подтверждения удаления:', err);
        return false;
    }
};

/**
 * Удаление локальных чатов/сообщений по списку pending
 */
window.processPendingDeletions = async function() {
    const pending = await window.fetchPendingDeletions();
    
    if (pending.length === 0) return;
    
    console.log(`🗑️ Обработка ${pending.length} удаленных элементов...`);
    
    const deviceFingerprint = window.getDeviceFingerprint();
    const chatStore = window.chatStore;
    
    for (const item of pending) {
        // Удаляем локальную копию
        if (item.entity_type === 'chat') {
            chatStore.deleteChat(item.id);
            console.log(`🗑️ Удален локальный чат ${item.id}`);
        } else if (item.entity_type === 'message') {
            // Находим чат по parent_id
            const found = chatStore.findChat(item.parent_id);
            if (found) {
                chatStore.deleteMessage(item.parent_id, item.id);
                console.log(`🗑️ Удалено локальное сообщение ${item.id}`);
            }
        }
        
        // Подтверждаем удаление на сервере
        await window.confirmPendingDeletion(item.id, deviceFingerprint);
    }
    
    // Сохраняем изменения
    chatStore.saveToStorage();
    
    // Обновляем UI
    if (window.chatUI) {
        window.chatUI.refreshUI();
    }
    
    console.log('✅ Обработка pending удалений завершена');
};

console.log('✅ PendingHandler загружен');
