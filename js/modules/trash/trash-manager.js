// ============================================
// js/modules/trash/trash-manager.js
// Описание: Управление корзиной
// ============================================

console.log('✅ TrashManager загружен');

/**
 * Получение списка корзины
 */
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
        console.error('Ошибка получения корзины:', err);
        return { chats: [], messages: [] };
    }
};

/**
 * Восстановление из корзины
 */
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
            
            // Если это чат, загружаем его заново
            if (type === 'chat' && window.chatService) {
                await window.chatService.getChat(id);
            }
            
            return true;
        }
        return false;
    } catch (err) {
        console.error('Ошибка восстановления:', err);
        return false;
    }
};

/**
 * Полное удаление из корзины (HARD DELETE)
 */
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
            console.log(`🗑️ Полностью удален ${type}: ${id}, ожидает ${data.pendingDevices || 0} устройств`);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Ошибка полного удаления:', err);
        return false;
    }
};

/**
 * Открыть модальное окно корзины
 */
window.openTrashModal = async function() {
    const modal = document.getElementById('trash-modal');
    const list = document.getElementById('trash-list');
    const empty = document.getElementById('trash-empty');
    const actions = document.getElementById('trash-actions');
    
    if (!modal) return;
    
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    
    if (list) list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--hint-color);">Загрузка...</div>';
    if (empty) empty.style.display = 'none';
    if (actions) actions.style.display = 'none';
    
    try {
        const trash = await window.fetchTrash();
        const items = [...(trash.chats || []), ...(trash.messages || [])];
        
        if (items.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.style.display = 'block';
            if (actions) actions.style.display = 'none';
            return;
        }
        
        if (list) {
            list.innerHTML = '';
            
            for (const item of items) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--secondary-bg); padding:10px 12px; border-radius:10px; font-size:13px; gap:8px;';
                
                const info = document.createElement('div');
                info.style.cssText = 'flex:1; overflow:hidden;';
                
                const type = item.chat_id ? '💬 сообщение' : '📁 чат';
                const title = item.title || item.chat_title || 'Без названия';
                const text = item.text || '';
                const preview = text.length > 60 ? text.substring(0, 60) + '...' : text;
                
                info.innerHTML = `
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span style="font-size:10px; font-weight:600; color:var(--hint-color);">${type}</span>
                        <span style="font-weight:500;">${title}</span>
                    </div>
                    ${preview ? `<div style="font-size:11px; color:var(--hint-color); margin-top:2px;">${preview}</div>` : ''}
                    <div style="font-size:10px; color:var(--hint-color); margin-top:2px;">
                        🗑️ ${window.formatDate(item.deleted_at || item.created_at)}
                    </div>
                `;
                
                const actionsRow = document.createElement('div');
                actionsRow.style.cssText = 'display:flex; gap:4px; flex-shrink:0;';
                
                const restoreBtn = document.createElement('button');
                restoreBtn.textContent = '↩️';
                restoreBtn.style.cssText = 'background:transparent; border:none; font-size:16px; cursor:pointer; padding:4px;';
                restoreBtn.title = 'Восстановить';
                restoreBtn.onclick = async () => {
                    const id = item.id;
                    const type = item.chat_id ? 'message' : 'chat';
                    const success = await window.restoreFromTrash(id, type);
                    if (success) {
                        await window.openTrashModal();
                        if (window.chatUI) window.chatUI.refreshUI();
                    }
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '💀';
                deleteBtn.style.cssText = 'background:transparent; border:none; font-size:16px; cursor:pointer; padding:4px; opacity:0.6;';
                deleteBtn.title = 'Удалить навсегда';
                deleteBtn.onclick = async () => {
                    const confirmMsg = 'Удалить навсегда без возможности восстановления?';
                    const action = async () => {
                        const id = item.id;
                        const type = item.chat_id ? 'message' : 'chat';
                        const success = await window.permanentDeleteFromTrash(id, type);
                        if (success) {
                            await window.openTrashModal();
                            if (window.chatUI) window.chatUI.refreshUI();
                        }
                    };
                    
                    if (window.tg?.showConfirm) {
                        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) action(); });
                    } else if (confirm(confirmMsg)) {
                        action();
                    }
                };
                
                actionsRow.appendChild(restoreBtn);
                actionsRow.appendChild(deleteBtn);
                
                row.appendChild(info);
                row.appendChild(actionsRow);
                list.appendChild(row);
            }
        }
        
        if (actions) actions.style.display = 'block';
        if (empty) empty.style.display = 'none';
        
    } catch (err) {
        console.error('Ошибка загрузки корзины:', err);
        if (list) list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--hint-color);">⚠️ Ошибка загрузки</div>';
    }
};

/**
 * Закрыть модальное окно корзины
 */
window.closeTrashModal = function() {
    const modal = document.getElementById('trash-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
};

/**
 * Очистить корзину полностью
 */
window.clearAllTrash = async function() {
    const confirmMsg = 'Удалить ВСЕ элементы из корзины без возможности восстановления?';
    
    const action = async () => {
        const trash = await window.fetchTrash();
        const items = [...(trash.chats || []), ...(trash.messages || [])];
        
        if (items.length === 0) return;
        
        let deleted = 0;
        for (const item of items) {
            const id = item.id;
            const type = item.chat_id ? 'message' : 'chat';
            const success = await window.permanentDeleteFromTrash(id, type);
            if (success) deleted++;
        }
        
        console.log(`🗑️ Очищено ${deleted} элементов из корзины`);
        await window.openTrashModal();
        if (window.chatUI) window.chatUI.refreshUI();
    };
    
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

// Обновляем счетчик корзины
window.updateTrashCount = async function() {
    const countEl = document.getElementById('trash-count');
    if (!countEl) return;
    
    try {
        const trash = await window.fetchTrash();
        const count = (trash.chats?.length || 0) + (trash.messages?.length || 0);
        
        if (count > 0) {
            countEl.textContent = count;
            countEl.style.display = 'inline';
        } else {
            countEl.style.display = 'none';
        }
    } catch (err) {
        countEl.style.display = 'none';
    }
};

console.log('✅ TrashManager загружен');
