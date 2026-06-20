// ============================================
// js/modules/export-local.js
// Описание: Экспорт архива
// ============================================

console.log('✅ ExportLocal загружен');

/**
 * Экспорт локального архива (доступен всем)
 */
window.exportLocalArchive = async function() {
    console.log('📦 Начинаем экспорт локального архива...');
    
    const chatStore = window.chatStore;
    if (!chatStore) {
        if (window.tg?.showAlert) window.tg.showAlert('Ошибка: хранилище не инициализировано');
        return;
    }
    
    const allChats = chatStore.histories || {};
    if (Object.keys(allChats).length === 0) {
        if (window.tg?.showAlert) {
            window.tg.showAlert('Нет данных для экспорта');
        } else {
            alert('Нет данных для экспорта');
        }
        return;
    }
    
    try {
        const exportData = {
            chatHistories: allChats,
            topicNames: window.topicNames || {},
            exportDate: new Date().toISOString(),
            appVersion: '2.0.0'
        };
        
        const response = await fetch('/api/chats/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportData)
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Ошибка экспорта');
        }
        
        if (data.total_parts > 1) {
            await window.downloadMultiPartArchive(data);
        } else {
            window.downloadJSON(data.archive, `versatile_ai_local_archive_${data.total_messages}_messages.json`);
        }
        
        if (window.tg?.showAlert) {
            window.tg.showAlert(`✅ Архив успешно создан! Скачано ${data.total_messages} сообщений.`);
        }
        
    } catch (err) {
        console.error('Ошибка экспорта локального архива:', err);
        
        // Fallback: прямой экспорт
        try {
            console.log('Пробуем прямой экспорт через браузер...');
            const fallbackArchive = [];
            for (const [topicId, chats] of Object.entries(allChats)) {
                for (const chat of (chats || [])) {
                    fallbackArchive.push({
                        chat_id: chat.id,
                        title: chat.title,
                        topic_id: topicId,
                        topic_name: window.topicNames?.[topicId] || topicId,
                        messages: chat.messages || []
                    });
                }
            }
            window.downloadJSON(fallbackArchive, `versatile_ai_local_archive_fallback.json`);
            
            if (window.tg?.showAlert) {
                window.tg.showAlert('⚠️ Архив создан в упрощенном формате. Некоторые данные могут отсутствовать.');
            }
        } catch (fallbackErr) {
            console.error('Fallback экспорт не удался:', fallbackErr);
            if (window.tg?.showAlert) {
                window.tg.showAlert('❌ Не удалось создать архив. Попробуйте позже.');
            }
        }
    }
};

/**
 * Скачивание многокомпонентного архива
 */
window.downloadMultiPartArchive = async function(firstPart) {
    const totalParts = firstPart.total_parts;
    const allArchiveParts = [firstPart.archive];
    
    console.log(`📦 Скачиваю архив из ${totalParts} частей...`);
    
    for (let part = 2; part <= totalParts; part++) {
        const response = await fetch('/api/chats/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Part': part.toString()
            },
            body: JSON.stringify({
                chatHistories: window.chatStore?.histories || {},
                topicNames: window.topicNames || {},
                exportOptions: { part: part.toString() }
            })
        });
        
        const partData = await response.json();
        if (partData.success && partData.archive) {
            allArchiveParts.push(partData.archive);
        } else {
            console.warn(`Часть ${part} не загрузилась`);
        }
    }
    
    const fullArchive = allArchiveParts.flat();
    window.downloadJSON(fullArchive, `versatile_ai_local_archive_full_${fullArchive.length}_chats.json`);
};

/**
 * Скачивание JSON файла
 */
window.downloadJSON = function(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Экспорт облачного архива (только PRO)
 */
window.exportCloudArchive = async function() {
    if (!window.userStore?.canSync()) {
        if (window.tg?.showAlert) {
            window.tg.showAlert('Облачный архив доступен только для PRO-пользователей.\n\nИспользуйте "Экспорт локального архива" для сохранения данных.');
        }
        return;
    }
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        console.error('Нет данных авторизации');
        return;
    }
    
    try {
        const response = await fetch('/api/chats/export', {
            method: 'GET',
            headers: { 'X-Telegram-Init-Data': initData }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.fallbackToLocal) {
                if (window.tg?.showConfirm) {
                    window.tg.showConfirm(
                        'Облачный архив временно недоступен. Скачать локальный архив?',
                        (ok) => { if (ok) window.exportLocalArchive(); }
                    );
                }
            } else {
                throw new Error(data.error || 'Ошибка экспорта');
            }
            return;
        }
        
        if (data.total_parts > 1) {
            // Облачный архив разбит на части - загружаем все
            const allParts = [data.archive];
            for (let part = 2; part <= data.total_parts; part++) {
                const partResponse = await fetch('/api/chats/export', {
                    method: 'GET',
                    headers: {
                        'X-Telegram-Init-Data': initData,
                        'X-Request-Part': part.toString()
                    }
                });
                const partData = await partResponse.json();
                if (partData.success && partData.archive) {
                    allParts.push(partData.archive);
                }
            }
            
            const fullArchive = allParts.flat();
            window.downloadJSON(fullArchive, `versatile_ai_cloud_archive_full_${fullArchive.length}_chats.json`);
        } else {
            window.downloadJSON(data, `versatile_ai_cloud_archive_${Date.now()}.json`);
        }
        
        if (data.grace_period_days_left !== null && data.grace_period_days_left > 0) {
            if (window.tg?.showAlert) {
                window.tg.showAlert(`⚠️ Ваши данные будут удалены через ${data.grace_period_days_left} дней. Сохраните архив в надежном месте.`);
            }
        }
        
    } catch (err) {
        console.error('Ошибка экспорта облачного архива:', err);
        if (window.tg?.showAlert) {
            window.tg.showAlert('Не удалось загрузить облачный архив. Проверьте подключение к интернету.');
        }
    }
};

/**
 * Инициализация кнопок экспорта
 */
window.initExportButtons = function() {
    const exportContainer = document.getElementById('export-buttons-container');
    if (!exportContainer) {
        const profileTab = document.getElementById('tab-profile');
        if (profileTab) {
            const container = document.createElement('div');
            container.id = 'export-buttons-container';
            container.style.cssText = 'margin-top: 16px; display: flex; flex-direction: column; gap: 8px;';
            container.innerHTML = `
                <button class="btn" style="background: var(--secondary-bg); color: var(--text-color);" onclick="window.exportLocalArchive()">💾 Экспорт локального архива</button>
                <button class="btn" id="cloud-export-btn" style="background: var(--secondary-bg); color: var(--text-color);" onclick="window.exportCloudArchive()">☁️ Экспорт облачного архива (PRO)</button>
            `;
            profileTab.appendChild(container);
        }
    }
    
    const cloudBtn = document.getElementById('cloud-export-btn');
    if (cloudBtn) {
        if (window.userStore?.canSync()) {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '☁️ Экспорт облачного архива (PRO)';
            cloudBtn.style.opacity = '1';
        } else {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '🔒 Облачный архив (доступен по PRO подписке)';
            cloudBtn.style.opacity = '0.6';
        }
    }
};

console.log('✅ ExportLocal загружен');
