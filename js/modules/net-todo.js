// js /modules /net-todo.js

// Глобальное состояние списка задач в памяти фронтенда
window.todoItemsList = [];

// Главная функция рендеринга модуля To-Do внутри контейнера Органайзера
window.renderTodoModule = function() {
    const container = document.getElementById('todo-module-container');
    if (!container) return;

    // Подгружаем актуальные задачи из локального кэша перед отрисовкой
    window.loadTodoItemsFromLocal();

    // Формируем чистую HTML-структуру модуля
    container.innerHTML = `
        <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03); margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">📋 To-Do List</span>
                <span style="font-size: 11px; font-weight: 600; color: var(--hint-color);" id="todo-counter-label">0/0</span>
            </div>
            
            <!-- Инпут ручного быстрого добавления задачи -->
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="manual-todo-input" placeholder="Добавить задачу..." style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); background: var(--bg-color); color: var(--text-color); font-size: 13px; outline: none;">
                <button class="btn" style="padding: 10px 14px; border-radius: 10px; font-size: 13px;" onclick="window.addManualTodoTask()">➕</button>
            </div>

            <!-- Сюда рендерятся сами элементы списка задач -->
            <div id="todo-items-render-zone" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 2px;"></div>
        </div>
    `;

    window.refreshTodoItemsDOM();
};

// Функция перерисовки элементов списка
window.refreshTodoItemsDOM = function() {
    const zone = document.getElementById('todo-items-render-zone');
    const counter = document.getElementById('todo-counter-label');
    if (!zone) return;

    zone.innerHTML = '';
    
    // Фильтруем задачи: выводим либо все, либо привязанные к текущему активному чипу-теме
    const currentTopicTasks = window.todoItemsList.filter(item => item.topic === window.currentTopic);
    
    const completedCount = currentTopicTasks.filter(t => t.isCompleted).length;
    if (counter) counter.innerText = `${completedCount}/${currentTopicTasks.length}`;

    if (currentTopicTasks.length === 0) {
        zone.innerHTML = `<p style="font-size: 12px; color: var(--hint-color); text-align: center; margin: 15px 0;">В этом разделе пока нет задач.</p>`;
        return;
    }

    currentTopicTasks.forEach(task => {
        const itemRow = document.createElement('div');
        itemRow.id = `todo-row-${task.id}`;
        itemRow.style.cssText = `display: flex; align-items: center; justify-content: space-between; background: var(--bg-color); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); gap: 10px; animation: fadeInUp 0.2s ease;`;

        // Чекбокс и текст задачи
        const leftGroup = document.createElement('div');
        leftGroup.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.isCompleted;
        checkbox.style.cssText = 'cursor: pointer; width: 16px; height: 16px; accent-color: var(--button-color); margin: 0;';
        checkbox.onclick = function() { window.toggleTodoTaskComplete(task.id); };

        const textSpan = document.createElement('span');
        textSpan.innerText = task.text;
        textSpan.style.cssText = `font-size: 13px; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; ${task.isCompleted ? 'text-decoration: line-through; opacity: 0.5;' : ''}`;

        leftGroup.appendChild(checkbox);
        leftGroup.appendChild(textSpan);

        // Кнопка удаления
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.6; padding: 2px;';
        delBtn.onclick = function(e) { e.stopPropagation(); window.deleteTodoTaskItem(task.id); };

        itemRow.appendChild(leftGroup);
        itemRow.appendChild(delBtn);
        zone.appendChild(itemRow);
    });
};

// Добавление задачи вручную пользователем из интерфейса To-Do
window.addManualTodoTask = function() {
    const input = document.getElementById('manual-todo-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;

    const newTask = {
        id: "todo_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        text: text,
        topic: window.currentTopic, // Жестко привязываем к текущему открытому чипу
        isCompleted: false,
        createdAt: new Date().toISOString()
    };

    window.todoItemsList.unshift(newTask);
    window.saveTodoItemsToLocal();
    
    input.value = '';
    window.refreshTodoItemsDOM();
};

// Интеграционный мост: функция для вызова AI-парсинга из контекста чата
window.injectContextTaskFromAI = function(parsedText, associatedTopic) {
    const newTask = {
        id: "todo_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        text: parsedText,
        topic: associatedTopic || window.currentTopic,
        isCompleted: false,
        createdAt: new Date().toISOString()
    };

    window.todoItemsList.unshift(newTask);
    window.saveTodoItemsToLocal();
    
    // Если сейчас открыт органайзер — мгновенно обновляем интерфейс
    if (document.getElementById('todo-items-render-zone')) {
        window.refreshTodoItemsDOM();
    }
};

// Изменение статуса выполнения (вычеркивание)
window.toggleTodoTaskComplete = function(taskId) {
    const task = window.todoItemsList.find(t => t.id === taskId);
    if (task) {
        task.isCompleted = !task.isCompleted;
        window.saveTodoItemsToLocal();
        window.refreshTodoItemsDOM();
    }
};

// Удаление задачи с нативным подтверждением Telegram
window.deleteTodoTaskItem = function(taskId) {
    const actionDelete = () => {
        window.todoItemsList = window.todoItemsList.filter(t => t.id !== taskId);
        window.saveTodoItemsToLocal();
        
        const row = document.getElementById(`todo-row-${taskId}`);
        if (row) {
            row.style.transition = 'all 0.2s ease';
            row.style.opacity = '0';
            row.style.transform = 'scale(0.95)';
            setTimeout(() => { window.refreshTodoItemsDOM(); }, 200);
        } else {
            window.refreshTodoItemsDOM();
        }
    };

    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_msg') : "Удалить эту задачу?";

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) actionDelete(); });
    } else if (confirm(confirmMsg)) {
        actionDelete();
    }
};

// Кэширование состояния в локальное хранилище устройства
window.loadTodoItemsFromLocal = function() {
    try {
        window.todoItemsList = JSON.parse(localStorage.getItem('tg_organizer_todo_list') || '[]');
    } catch(e) {
        window.todoItemsList = [];
    }
};

window.saveTodoItemsToLocal = function() {
    try {
        const jsonStr = JSON.stringify(window.todoItemsList);
        localStorage.setItem('tg_organizer_todo_list', jsonStr);
        
        // ДУБЛИРОВАНИЕ В ОБЛАКО TELEGRAM (Для надежности):
        if (window.tg?.CloudStorage) {
            window.tg.CloudStorage.setItem('tg_organizer_todo_list', jsonStr, (err) => {
                if (err) console.error("Ошибка сохранения в CloudStorage:", err);
            });
        }
    } catch(e) {
        console.error("Превышен лимит localStorage To-Do:", e);
    }
};
