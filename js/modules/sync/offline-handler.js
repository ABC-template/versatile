// ============================================
// js/modules/sync/offline-handler.js
// Описание: Обработка офлайн-режима
// ============================================

console.log('✅ OfflineHandler загружен');

// Используем queueManager вместо глобальной очереди
window.offlineQueue = [];

/**
 * Сохраняем сообщение в офлайн-очередь
 */
window.addToOfflineQueue = function(chatId, message, topicId) {
    if (window.queueManager) {
        window.queueManager.addOffline(chatId, message, topicId);
    } else {
        // Fallback
        window.offlineQueue.push({
            chatId,
            message,
            topicId,
            timestamp: new Date().toISOString(),
            attempts: 0
        });
        window.saveOfflineQueue();
    }
};

/**
 * Сохраняем очередь в localStorage
 */
window.saveOfflineQueue = function() {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anonymous';
    try {
        localStorage.setItem(`offline_queue_${userId}`, JSON.stringify(window.offlineQueue));
    } catch (e) {
        console.error('Ошибка сохранения офлайн-очереди:', e);
    }
};

/**
 * Загружаем очередь из localStorage
 */
window.loadOfflineQueue = function() {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anonymous';
    try {
        const data = localStorage.getItem(`offline_queue_${userId}`);
        window.offlineQueue = data ? JSON.parse(data) : [];
    } catch (e) {
        window.offlineQueue = [];
    }
};

/**
 * Обработка офлайн-очереди при восстановлении сети
 */
window.processOfflineQueue = async function() {
    if (!navigator.onLine) {
        console.log('📶 Нет интернета, очередь не обрабатывается');
        return;
    }
    
    if (window.queueManager) {
        await window.queueManager.processOffline();
        return;
    }
    
    // Fallback
    if (window.offlineQueue.length === 0) return;
    
    console.log(`📤 Обработка ${window.offlineQueue.length} сообщений из офлайн-очереди...`);
    
    const failed = [];
    
    for (const item of window.offlineQueue) {
        try {
            item.attempts++;
            
            const initData = window.Telegram?.WebApp?.initData;
            if (!initData) {
                failed.push(item);
                continue;
            }
            
            const response = await fetch('/api/chats/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({
                    action: 'new_message',
                    chatId: item.chatId,
                    topicId: item.topicId,
                    message: item.message
                })
            });
            
            const data = await response.json();
            
            if (data.synced || data.success) {
                console.log(`✅ Сообщение из офлайн-очереди отправлено: ${item.message.id}`);
            } else {
                if (item.attempts < 5) {
                    failed.push(item);
                } else {
                    console.error(`❌ Сообщение не отправлено после ${item.attempts} попыток: ${item.message.id}`);
                }
            }
        } catch (err) {
            console.error('Ошибка обработки офлайн-очереди:', err);
            if (item.attempts < 5) {
                failed.push(item);
            }
        }
    }
    
    window.offlineQueue = failed;
    window.saveOfflineQueue();
    
    if (failed.length === 0) {
        console.log('✅ Офлайн-очередь полностью обработана');
    } else {
        console.log(`⏳ ${failed.length} сообщений ожидают повторной попытки`);
    }
};

/**
 * Запуск периодической проверки офлайн-очереди
 */
window.startOfflineQueueProcessor = function() {
    window.loadOfflineQueue();
    
    // Проверка каждые 30 секунд
    setInterval(() => {
        if (navigator.onLine && (window.offlineQueue.length > 0 || window.queueManager?.getQueueSize() > 0)) {
            window.processOfflineQueue();
            if (window.queueManager) {
                window.queueManager.process();
            }
        }
    }, 30000);
    
    // При восстановлении сети
    window.addEventListener('online', () => {
        setTimeout(() => {
            window.processOfflineQueue();
            if (window.queueManager) {
                window.queueManager.process();
            }
        }, 2000);
    });
};

console.log('✅ OfflineHandler загружен');
