// js /modules /net-scheduler.js

// Глобальное состояние списка напоминаний, загруженных из облака
window.activeRemindersList = [];

// Главная функция рендеринга модуля Напоминаний внутри хаба Органайзера
window.renderSchedulerModule = function() {
    const container = document.getElementById('scheduler-module-container');
    if (!container) return;

    // Формируем чистую HTML-структуру планировщика
    container.innerHTML = `
        <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03); margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">⏰ Напоминания (Push)</span>
                <span style="font-size: 11px; font-weight: 600; color: var(--hint-color);" id="scheduler-counter-label">В ожидании: 0</span>
            </div>
            
            <!-- Форма быстрого создания точечного напоминания -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; background: var(--bg-color); padding: 10px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.02);">
                <input type="text" id="sched-task-input" placeholder="О чем напомнить?..." style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
                
                <div style="display: flex; gap: 6px;">
                    <input type="date" id="sched-date-input" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 12px; outline: none;">
                    <input type="time" id="sched-time-input" style="width: 90px; padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 12px; outline: none;">
                </div>
                
                <button class="btn" style="padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 600;" onclick="window.createManualPushReminder()">🔔 Поставить будильник</button>
            </div>

            <!-- Зона вывода активных напоминаний из базы -->
            <div id="scheduler-items-render-zone" style="display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 2px;"></div>
        </div>
    `;

    // Выставляем дефолтную сегодняшнюю дату в инпут для удобства
    const dateInput = document.getElementById('sched-date-input');
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    window.syncRemindersWithCloud();
};

// Перерисовка списка напоминаний в DOM
window.refreshRemindersDOM = function() {
    const zone = document.getElementById('scheduler-items-render-zone');
    const counter = document.getElementById('scheduler-counter-label');
    if (!zone) return;

    zone.innerHTML = '';
    
    // Фильтруем пуши по текущему активному чипу-теме
    const currentTopicReminders = window.activeRemindersList.filter(r => r.topic_id === window.currentTopic && r.status === 'pending');
    
    if (counter) counter.innerText = `В ожидании: ${currentTopicReminders.length}`;

    if (currentTopicReminders.length === 0) {
        zone.innerHTML = `<p style="font-size: 12px; color: var(--hint-color); text-align: center; margin: 15px 0;">Нет активных напоминаний.</p>`;
        return;
    }

    currentTopicReminders.forEach(rem => {
        const itemRow = document.createElement('div');
        itemRow.id = `reminder-row-${rem.id}`;
        itemRow.style.cssText = `display: flex; align-items: center; justify-content: space-between; background: var(--bg-color); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); gap: 10px; animation: fadeInUp 0.2s ease;`;

        // Информация о времени и сути пуша
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'display: flex; flex-direction: column; flex: 1; overflow: hidden; gap: 2px; text-align: left;';
        
        // Красиво форматируем ISO-дату триггера
        const triggerDate = new Date(rem.trigger_at);
        const timeStr = triggerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = triggerDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

        const timeSpan = document.createElement('span');
        timeSpan.innerText = `⏰ ${dateStr}, ${timeStr}`;
        timeSpan.style.cssText = 'font-size: 10px; font-weight: bold; color: var(--button-color);';

        const textSpan = document.createElement('span');
        textSpan.innerText = rem.task_text;
        textSpan.style.cssText = 'font-size: 12px; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;';

        infoDiv.appendChild(timeSpan);
        infoDiv.appendChild(textSpan);

        // Кнопка удаления напоминания
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.6; padding: 2px;';
        delBtn.onclick = function(e) { e.stopPropagation(); window.deleteCloudReminderItem(rem.id); };

        itemRow.appendChild(infoDiv);
        itemRow.appendChild(delBtn);
        zone.appendChild(itemRow);
    });
};

// Функция ручного создания напоминания из интерфейса
window.createManualPushReminder = async function() {
    const textInput = document.getElementById('sched-task-input');
    const dateInput = document.getElementById('sched-date-input');
    const timeInput = document.getElementById('sched-time-input');
    
    if (!textInput || !dateInput || !timeInput) return;
    
    const text = textInput.value.trim();
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;

    if (!text || !dateVal || !timeVal) {
        if (window.tg?.showAlert) window.tg.showAlert("Заполните все поля напоминания!");
        return;
    }

    // Собираем точную дату в формате ISO с учетом таймзоны устройства
    const targetDateTime = new Date(`${dateVal}T${timeVal}`);
    if (targetDateTime <= new Date()) {
        if (window.tg?.showAlert) window.tg.showAlert("Время напоминания уже прошло!");
        return;
    }

    const uid = window.tg?.initDataUnsafe?.user?.id || 12345; // Тестовый ID, если запуск вне TG

    const payload = {
        action: 'create_reminder',
        userId: uid,
        topicId: window.currentTopic,
        taskText: text,
        triggerAt: targetDateTime.toISOString()
    };

    // Шлем запрос на наш будущий единый бэкенд-роут Supabase
    try {
        const response = await fetch('/api/organizer/core', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resData = await response.json();

        if (resData.success) {
            textInput.value = '';
            timeInput.value = '';
            await window.syncRemindersWithCloud(); // Обновляем список из базы
        } else {
            if (window.tg?.showAlert) window.tg.showAlert(`Ошибка: ${resData.error}`);
        }
    } catch (err) {
        console.error("Сбой сети при создании напоминания:", err);
    }
};

// Синхронизация списка напоминаний с облачной базой Supabase (Запрос списка)
window.syncRemindersWithCloud = async function() {
    const uid = window.tg?.initDataUnsafe?.user?.id || 12345;
    
    try {
        const response = await fetch(`/api/organizer/core?action=get_reminders&userId=${uid}`);
        const resData = await response.json();

        if (resData.success && Array.isArray(resData.data)) {
            window.activeRemindersList = resData.data;
            window.refreshRemindersDOM();
        }
    } catch (err) {
        console.error("Сбой синхронизации напоминаний с облаком:", err);
    }
};

// Удаление напоминания из Supabase с нативным подтверждением
window.deleteCloudReminderItem = function(reminderId) {
    const actionDelete = async () => {
        const payload = {
            action: 'delete_reminder',
            id: reminderId
        };

        try {
            const response = await fetch('/api/organizer/core', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resData = await response.json();

            if (resData.success) {
                window.activeRemindersList = window.activeRemindersList.filter(r => r.id !== reminderId);
                
                const row = document.getElementById(`reminder-row-${reminderId}`);
                if (row) {
                    row.style.transition = 'all 0.2s ease';
                    row.style.opacity = '0';
                    row.style.transform = 'scale(0.95)';
                    setTimeout(() => { window.refreshRemindersDOM(); }, 200);
                } else {
                    window.refreshRemindersDOM();
                }
            }
        } catch (err) {
            console.error("Сбой удаления напоминания из облака:", err);
        }
    };

    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_msg') : "Удалить это напоминание?";

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) actionDelete(); });
    } else if (confirm(confirmMsg)) {
      actionDelete();
    }
};
