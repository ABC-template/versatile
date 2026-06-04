// js /modules /net-tracker.js (Часть 1 из 2)

// Глобальные массивы трекеров и их логов/заметок в памяти фронтенда
window.userTrackersList = [];
window.trackerLogsList = [];

// Главная функция рендеринга модуля Трекеров внутри хаба Органайзера
window.renderTrackerModule = function() {
    const container = document.getElementById('tracker-module-container');
    if (!container) return;

    container.innerHTML = `
        <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">📊 Lifestyle-Трекеры</span>
                <button class="btn" style="padding: 4px 10px; font-size: 11px; border-radius: 8px;" onclick="window.showCreateTrackerFormDOM()">➕ Создать цель</button>
            </div>
            
            <!-- Контейнер формы быстрого создания новой цели -->
            <div id="tracker-creation-zone" style="display: none; flex-direction: column; gap: 8px; background: var(--bg-color); padding: 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); margin-bottom: 12px; animation: fadeInUp 0.2s ease;"></div>

            <!-- Сюда рендерятся карточки активных трекеров текущего направления -->
            <div id="trackers-cards-render-zone" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>
    `;

    window.syncTrackersWithCloud();
};

// Функция отрисовки формы создания трекера привычек/прогресса
window.showCreateTrackerFormDOM = function() {
    const zone = document.getElementById('tracker-creation-zone');
    if (!zone) return;

    if (zone.style.display === 'flex') {
        zone.style.display = 'none';
        return;
    }

    zone.style.display = 'flex';
    zone.innerHTML = `
        <div style="font-size: 12px; font-weight: bold; color: var(--hint-color); margin-bottom: 2px;">Название цели:</div>
        <input type="text" id="new-tracker-title" placeholder="Напр: Без сигарет, Тренировки, Калории..." style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
        
        <div style="font-size: 12px; font-weight: bold; color: var(--hint-color); margin-top: 4px; margin-bottom: 2px;">Тон мотивации ИИ:</div>
        <select id="new-tracker-tone" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
            <option value="support">🌤️ Мягкая поддержка и эмпатия</option>
            <option value="discipline">⚡ Жесткая армейская дисциплина</option>
            <option value="sarcasm">😎 Юмор и Сарказм (Grok стиль)</option>
        </select>
        
        <button class="btn" style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: bold; margin-top: 8px;" onclick="window.sendNewTrackerToCloud()">🚀 Запустить трекер</button>
    `;
};

// Перерисовка карточек активных трекеров в DOM
window.refreshTrackersCardsDOM = function() {
    const zone = document.getElementById('trackers-cards-render-zone');
    if (!zone) return;

    zone.innerHTML = '';
    // Фильтруем трекеры по текущему разделу (чипу)
    const currentTopicTrackers = window.userTrackersList.filter(t => t.topic_id === window.currentTopic);

    if (currentTopicTrackers.length === 0) {
        zone.innerHTML = `<p style="font-size: 12px; color: var(--hint-color); text-align: center; margin: 15px 0;">У вас пока нет активных трекеров в этом разделе.</p>`;
        return;
    }

    currentTopicTrackers.forEach(tracker => {
        const card = document.createElement('div');
        card.style.cssText = `background: var(--bg-color); border: 1px solid rgba(0,0,0,0.04); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.01); animation: fadeInUp 0.2s ease;`;

        // Шапка карточки трекера
        const head = document.createElement('div');
        head.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        
        const titleSpan = document.createElement('span');
        titleSpan.innerText = tracker.title;
        titleSpan.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--text-color);';
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.5;';
        delBtn.onclick = function() { window.deleteCloudTrackerItem(tracker.id); };
        
        head.appendChild(titleSpan);
        head.appendChild(delBtn);

        // Интерактивная кнопка-анализатор ИИ (Динамический отчет на лету)
        const aiAnalyzeBtn = document.createElement('button');
        aiAnalyzeBtn.innerText = '🧠 Анализ прогресса ИИ';
        aiAnalyzeBtn.style.cssText = 'background: rgba(var(--tg-theme-button-color,0,136,204), 0.07); color: var(--button-color); border: none; border-radius: 8px; padding: 8px; font-size: 11px; font-weight: bold; cursor: pointer; display: block; width: 100%; text-align: center; margin-top: 2px;';
        aiAnalyzeBtn.onclick = function() { window.triggerTrackerAiAnalysis(tracker.id, tracker.title); };

        // Зона быстрого внесения лога и заметки на Сегодня/Вчера
        const quickLogZone = document.createElement('div');
        quickLogZone.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 4px; background: var(--secondary-bg); padding: 8px; border-radius: 10px;';
        quickLogZone.innerHTML = `
            <div style="display: flex; gap: 6px;">
                <input type="text" id="log-val-${tracker.id}" placeholder="Значение (напр: 1 сигарета, 5км, 0.5 дня...)" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 12px; outline: none;">
                <select id="log-date-${tracker.id}" style="padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 11px; outline: none;">
                    <option value="today">Сегодня</option>
                    <option value="yesterday">Вчера</option>
                </select>
            </div>
            <textarea id="log-note-${tracker.id}" placeholder="Добавить заметку-триггер (почему, контекст)..." rows="1" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 12px; outline: none; resize: none; box-sizing: border-box; font-family: inherit;"></textarea>
            <button class="btn" style="padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold;" onclick="window.submitQuickTrackerLog('${tracker.id}')">💾 Зафиксировать в журнал</button>
        `;

        // Контейнер ленты истории логов и заметок для конкретной карточки
        const logsHistoryZone = document.createElement('div');
        logsHistoryZone.id = `logs-history-${tracker.id}`;
        logsHistoryZone.style.cssText = 'max-height: 110px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-right: 2px;';

        card.appendChild(head);
        card.appendChild(aiAnalyzeBtn);
        card.appendChild(quickLogZone);
        card.appendChild(logsHistoryZone);
        zone.appendChild(card);

        // Сразу рендерим логи для этой карточки
        window.renderTrackerLogsHistoryDOM(tracker.id);
    });
};// js /modules /net-tracker.js (Часть 2 из 2)

// Функция отрисовки журнала логов и заметок для конкретной карточки трекера
window.renderTrackerLogsHistoryDOM = function(trackerId) {
    const historyZone = document.getElementById(`logs-history-${trackerId}`);
    if (!historyZone) return;

    historyZone.innerHTML = '';
    
    // Фильтруем логи, принадлежащие строго этому трекеру
    const currentLogs = window.trackerLogsList
        .filter(l => l.tracker_id === trackerId)
        .sort((a, b) => new Date(b.logged_date) - new Date(a.logged_date));

    if (currentLogs.length === 0) {
        historyZone.innerHTML = `<div style="font-size: 11px; color: var(--hint-color); text-align: center; margin: 6px 0;">Журнал событий пуст.</div>`;
        return;
    }

    currentLogs.forEach(log => {
        const logRow = document.createElement('div');
        logRow.id = `log-item-row-${log.id}`;
        logRow.style.cssText = 'background: rgba(0,0,0,0.02); padding: 8px; border-radius: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 3px; border-left: 3px solid var(--button-color); position: relative; animation: fadeInUp 0.15s ease;';

        const dateObj = new Date(log.logged_date);
        const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

        // Шапка лога со значением и кнопкой удаления
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-weight: bold;';
        topRow.innerHTML = `
            <span style="color: var(--text-color);">${dateString}: <span style="color: var(--button-color);">${log.value}</span></span>
            <button style="background: transparent; border: none; outline: none; font-size: 10px; cursor: pointer; opacity: 0.5; padding: 0;" onclick="window.deleteCloudTrackerLog('${log.id}', '${trackerId}')">🗑️</button>
        `;

        logRow.appendChild(topRow);

        // Если к логу прикреплена текстовая психологическая заметка-триггер
        if (log.note_text && log.note_text.trim().length > 0) {
            const noteDiv = document.createElement('div');
            noteDiv.style.cssText = 'color: var(--text-color); font-style: italic; line-height: 1.3; opacity: 0.85; word-wrap: break-word; background: var(--bg-color); padding: 4px 6px; border-radius: 4px; margin-top: 2px;';
            noteDiv.innerText = `📝 ${log.note_text}`;
            logRow.appendChild(noteDiv);
        }

        historyZone.appendChild(logRow);
    });
};

// Отправка нового лога с заметкой в облачную базу данных Supabase
window.submitQuickTrackerLog = async function(trackerId) {
    const valInput = document.getElementById(`log-val-${trackerId}`);
    const dateSelect = document.getElementById(`log-date-${trackerId}`);
    const noteTextarea = document.getElementById(`log-note-${trackerId}`);

    if (!valInput || !dateSelect || !noteTextarea) return;

    const value = valInput.value.trim();
    const dateType = dateSelect.value;
    const noteText = noteTextarea.value.trim();

    if (!value) {
        if (window.tg?.showAlert) window.tg.showAlert("Введите значение фиксации!");
        return;
    }

    // Вычисляем точную дату фиксации лога
    const targetDate = new Date();
    if (dateType === 'yesterday') {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    const payload = {
        action: 'create_log',
        trackerId: trackerId,
        value: value,
        noteText: noteText,
        loggedDate: targetDate.toISOString()
    };

    try {
        const response = await fetch('/api/organizer/core', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resData = await response.json();

        if (resData.success) {
            valInput.value = '';
            noteTextarea.value = '';
            await window.syncTrackersWithCloud(); // Перечитываем базу для полной синхронизации
        } else {
            if (window.tg?.showAlert) window.tg.showAlert(`Ошибка: ${resData.error}`);
        }
    } catch (err) {
        console.error("Сбой отправки лога в Supabase:", err);
    }
};

// Создание самой карточки новой цели в Supabase
window.sendNewTrackerToCloud = async function() {
    const titleInput = document.getElementById('new-tracker-title');
    const toneSelect = document.getElementById('new-tracker-tone');
    if (!titleInput || !toneSelect) return;

    const title = titleInput.value.trim();
    const tone = toneSelect.value;
    const uid = window.tg?.initDataUnsafe?.user?.id || 12345;

    if (!title) {
        if (window.tg?.showAlert) window.tg.showAlert("Введите название цели!");
        return;
    }

    const payload = {
        action: 'create_tracker',
        userId: uid,
        topicId: window.currentTopic,
        title: title,
        settings: JSON.stringify({ tone: tone, created_via: 'tma' })
    };

    try {
        const response = await fetch('/api/organizer/core', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resData = await response.json();

        if (resData.success) {
            titleInput.value = '';
            const zone = document.getElementById('tracker-creation-zone');
            if (zone) zone.style.display = 'none';
            await window.syncTrackersWithCloud();
        }
    } catch (err) {
        console.error("Сбой сети при создании трекера:", err);
    }
};

// Запрос и синхронизация всех трекеров и их логов из Supabase
window.syncTrackersWithCloud = async function() {
    const uid = window.tg?.initDataUnsafe?.user?.id || 12345;
    
    try {
        const response = await fetch(`/api/organizer/core?action=get_trackers&userId=${uid}`);
        const resData = await response.json();

        if (resData.success && resData.data) {
            window.userTrackersList = resData.data.trackers || [];
            window.trackerLogsList = resData.data.logs || [];
            window.refreshTrackersCardsDOM();
        }
    } catch (err) {
        console.error("Сбой синхронизации трекеров с облаком:", err);
    }
};

// Удаление лога/заметки из Supabase с нативным подтверждением
window.deleteCloudTrackerLog = function(logId, trackerId) {
    const actionDeleteLog = async () => {
        try {
            const response = await fetch('/api/organizer/core', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_log', id: logId })
            });
            const resData = await response.json();

            if (resData.success) {
                window.trackerLogsList = window.trackerLogsList.filter(l => l.id !== logId);
                window.renderTrackerLogsHistoryDOM(trackerId);
            }
        } catch (err) {
            console.error("Сбой удаления лога:", err);
        }
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm("Удалить эту запись из журнала?", (ok) => { if (ok) actionDeleteLog(); });
    } else if (confirm("Удалить эту запись из журнала?")) {
        actionDeleteLog();
    }
};

// Нативное удаление всей карточки цели из базы
window.deleteCloudTrackerItem = function(trackerId) {
    const actionDeleteTracker = async () => {
        try {
            const response = await fetch('/api/organizer/core', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_tracker', id: trackerId })
            });
            const resData = await response.json();

            if (resData.success) {
                window.userTrackersList = window.userTrackersList.filter(t => t.id !== trackerId);
                window.trackerLogsList = window.trackerLogsList.filter(l => l.tracker_id !== trackerId);
                window.refreshTrackersCardsDOM();
            }
        } catch (err) {
            console.error("Сбой удаления трекера:", err);
        }
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm("Полностью удалить этот трекер и всю историю его заметок?", (ok) => { if (ok) actionDeleteTracker(); });
    } else if (confirm("Полностью удалить этот трекер и всю историю его заметок?")) {
        actionDeleteTracker();
    }
};

// Вызов ИИ-генератора нейробиологического и психологического отчета на лету
window.triggerTrackerAiAnalysis = async function(trackerId, trackerTitle) {
    // Временно закрываем профиль, чтобы переключить пользователя на экран чата и запустить стрим
    const card = document.getElementById('profile-card');
    if (card) card.classList.add('hidden');
    if (window.tg?.BackButton) window.tg.BackButton.hide();

    if (typeof window.showSkeleton === 'function') window.showSkeleton();

    // Собираем историю логов и текстовых заметок по этой цели для контекста ИИ
    const relatedLogs = window.trackerLogsList
        .filter(l => l.tracker_id === trackerId)
        .map(l => `[Дата: ${l.logged_date.substring(0, 10)}, Действие: ${l.value}, Заметка: ${l.note_text || 'нет'}]`)
        .join('\n');

    // Формируем скрытую команду-инструкцию для вызова отчета на сервере
    const systemPromptMessage = [{
        type: 'user-msg',
        text: `Сделай подробный научный, физиологический и психологический анализ моего прогресса по цели: "${trackerTitle}". Вот журнал моих фиксаций и текстовых заметок триггеров:\n${relatedLogs || 'Журнал пуст, я только начинаю свой путь.'}\n\nПожалуйста, разложи по полочкам, какие позитивные изменения происходят в моем организме, мозге и дофаминовых рецепторах прямо сейчас на этом этапе. Отвечай развернуто, структурировано.`
    }];

    try {
        const activeChat = window.getCurrentActiveChat();
      const userLang = activeChat?.language || window.tg?.initDataUnsafe?.user?.language_code || 'ru';if (typeof window.streamAiResponse === 'function') {
        // Передаем кастомный триггер в обход стандартной истории
      await window.streamAiResponse(systemPromptMessage, 'fast', userLang, activeChat);
      }
    } 
    catch (err) {
      if (typeof window.hideSkeleton === 'function') 
        window.hideSkeleton();console.error("Сбой запуска ИИ анализа трекера:", err);
    }
};
