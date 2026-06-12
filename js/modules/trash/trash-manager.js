// js/modules/trash/trash-manager.js

// Получение списка корзины
window.fetchTrash = async function() {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return { chats: [], messages: [] };
    
    try {
        const response = await fetch('/api/chats/trash', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        
        if (data.success) {
            return { chats: data.chats || [], messages: data.messages || [] };
        }
        return { chats: [], messages: [] };
    } catch (err) {
        console.error("Ошибка получения корзины:", err);
        return { chats: [], messages: [] };
    }
};

// Восстановление из корзины
window.restoreFromTrash = async function(id, type) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return false;
    
    try {
        const response = await fetch('/api/chats/trash', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ id, type })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Восстановлен ${type}: ${id}`);
            return true;
        }
        return false;
    } catch (err) {
        console.error("Ошибка восстановления:", err);
        return false;
    }
};

// Полное удаление из корзины (HARD DELETE)
window.permanentDeleteFromTrash = async function(id, type) {
    const deviceFingerprint = window.getDeviceFingerprint();
    if (!deviceFingerprint) return false;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return false;
    
    try {
        const response = await fetch('/api/chats/trash', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ id, type, deviceFingerprint })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`🗑️ Полностью удален ${type}: ${id}, ожидает ${data.pendingDevices} устройств`);
            return true;
        }
        return false;
    } catch (err) {
        console.error("Ошибка полного удаления:", err);
        return false;
    }
};
