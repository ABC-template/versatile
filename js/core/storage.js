// Первичная выгрузка тяжелой истории переписок из памяти устройства при старте
window.loadLocalHistories = function() {
    try { window.chatHistories = JSON.parse(localStorage.getItem('tg_chat_histories') || '{}'); } catch(e) { window.chatHistories = {}; }
    try { window.activeChatIds = JSON.parse(localStorage.getItem('active_chat_ids') || '{}'); } catch(e) { window.activeChatIds = { gemini: null, deepseek: null, gpt: null, claude: null, grok: null }; }
};

// Функция сохранения текущего состояния диалогов в локальную память
window.saveHistoriesToLocal = function() {
    try {
        localStorage.setItem('tg_chat_histories', JSON.stringify(window.chatHistories));
        localStorage.setItem('active_chat_ids', JSON.stringify(window.activeChatIds));
    } catch (e) { console.error("Превышен лимит памяти localStorage устройства:", e); }
};

// Создание нового чистого диалога для текущей выбранной модели ИИ
window.createNewChat = function() {
    if (!window.chatHistories[window.currentModel]) window.chatHistories[window.currentModel] = [];
    const newId = "chat_" + Date.now();
    const currentList = window.chatHistories[window.currentModel];
    const currentWelcome = window.welcomeTexts[window.currentModel] || `Привет! Я ${window.modelNames[window.currentModel] || window.currentModel}. Чем могу помочь?`;

    currentList.unshift({
        id: newId,
        title: `Диалог #${currentList.length + 1}`,
        maxContext: 15,
        messages: [{ 
            id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7), 
            text: currentWelcome, 
            type: "ai-msg" 
        }]
    });

    window.activeChatIds[window.currentModel] = newId;
    window.saveHistoriesToLocal();
    
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    if (typeof window.loadActiveChatMessages === 'function') window.loadActiveChatMessages();
    if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
    
    const card = document.getElementById('profile-card');
    if (card) {
        card.classList.add('hidden');
        if (window.tg && window.tg.BackButton) window.tg.BackButton.hide();
    }
};

// Переключение между диалогами кликом по меню
window.switchActiveChat = function(chatId) {
    window.activeChatIds[window.currentModel] = chatId;
    window.saveHistoriesToLocal();
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    if (typeof window.loadActiveChatMessages === 'function') window.loadActiveChatMessages();
    if (typeof window.updateContextButtonDisplay === 'function') window.updateContextButtonDisplay();
    if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
};

// Безопасное удаление диалога с защитой от Event Bubbling и очисткой избранного
window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    let modelsChats = window.chatHistories[window.currentModel] || [];
    window.chatHistories[window.currentModel] = modelsChats.filter(c => c.id !== chatId);

    if (window.activeChatIds[window.currentModel] === chatId) {
        const remainingChats = window.chatHistories[window.currentModel];
        window.activeChatIds[window.currentModel] = remainingChats[0]?.id || null;
    }

    window.saveHistoriesToLocal();
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    if (typeof window.selectModel === 'function') window.selectModel(window.currentModel);
    if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
};

// Добавление сообщения в историю и авто-генерация названия чата по первой фразе
window.addMessageToStorage = function(text, className) {
    if (!window.chatHistories[window.currentModel]) window.chatHistories[window.currentModel] = [];
    const currentActiveId = window.activeChatIds[window.currentModel];
    const activeChat = window.chatHistories[window.currentModel].find(c => c.id === currentActiveId);

    const generatedMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    if (activeChat) {
        activeChat.messages.push({ 
            id: generatedMsgId, 
            text: text, 
            type: className 
        });
        if (className === 'user-msg' && activeChat.title.startsWith('Диалог #')) {
            activeChat.title = text.substring(0, 18) + (text.length > 18 ? '...' : '');
        }
    }

    window.saveHistoriesToLocal();
    if (typeof window.renderMessageToDOM === 'function') window.renderMessageToDOM(text, className, generatedMsgId);
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
};
