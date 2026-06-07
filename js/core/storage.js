// js /core /storage.js

window.loadLocalHistories = function() {
    try { window.chatHistories = JSON.parse(localStorage.getItem('tg_chat_histories') || '{}'); } catch(e) { window.chatHistories = {}; }
    try { window.activeChatIds = JSON.parse(localStorage.getItem('active_chat_ids') || '{}'); } catch(e) { window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null }; }
};

window.saveHistoriesToLocal = function() {
    try {
        localStorage.setItem('tg_chat_histories', JSON.stringify(window.chatHistories));
        localStorage.setItem('active_chat_ids', JSON.stringify(window.activeChatIds));
    } catch (e) { console.error("Превышен лимит localStorage:", e); }
};

window.getCurrentActiveChat = function() {
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    return modelsChats.find(c => c.id === currentActiveId) || null;
};

window.createNewChat = function() {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    const newId = "chat_" + Date.now();
    const currentList = window.chatHistories[window.currentTopic];
    const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
    
    // Берем системный язык для первичной разметки чата
    const sysLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
    const startTitle = `${window.getLangString('start_chat')} "${sectionName}"`;

    currentList.unshift({
        id: newId,
        title: startTitle,
        maxContext: 15,
        language: sysLang, // Сохраняем язык общения внутри объекта чата
        topic: window.currentTopic,
        messages: [{ 
            id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7), 
            text: window.welcomeTexts[window.currentTopic] || `Привет!`, 
            type: "ai-msg" 
        }]
    });

    window.activeChatIds[window.currentTopic] = newId;
    window.saveHistoriesToLocal();
    
    window.refreshUiAfterChatSelection();
    
    const card = document.getElementById('profile-card');
    if (card) {
        card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
    }
};

window.switchActiveChat = async function(chatId) {
    window.activeChatIds[window.currentTopic] = chatId;
    window.saveHistoriesToLocal();
    if (window.config && window.config.syncEnabled && typeof window.loadFullChat === 'function') {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
            await window.loadFullChat(chatId);
        }
    }
    window.refreshUiAfterChatSelection();
};

window.refreshUiAfterChatSelection = function() {
    window.applyUiLocalization(); // Перерисовываем интерфейс под язык активного чата
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    if (typeof window.loadActiveChatMessages === 'function') window.loadActiveChatMessages();
    if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
};

window.deleteChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation(); 
    
    const action = () => {
        let modelsChats = window.chatHistories[window.currentTopic] || [];
        window.chatHistories[window.currentTopic] = modelsChats.filter(c => c.id !== chatId);

        if (window.activeChatIds[window.currentTopic] === chatId) {
            const remainingChats = window.chatHistories[window.currentTopic];
            window.activeChatIds[window.currentTopic] = remainingChats[0]?.id || null;
        }

        window.saveHistoriesToLocal();
        window.refreshUiAfterChatSelection();
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_chat'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_chat'))) {
        action();
    }
};

// Функция переименования чата (Книга со своим названием)
window.renameChat = function(event, chatId) {
    if (event && event.stopPropagation) event.stopPropagation();
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const chat = modelsChats.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt(window.getLangString('prompt_rename'), chat.title);
    if (newTitle && newTitle.trim().length > 0) {
        chat.title = newTitle.trim();
        chat.userRenamed = true; // Запрещаем авто-переименование первой фразой
        window.saveHistoriesToLocal();
        if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
    }
};

// Функция удаления отдельной реплики внутри чата (Чистка книги знаний)
window.deleteMessage = function(msgId) {
    const action = () => {
        const activeChat = window.getCurrentActiveChat();
        if (!activeChat) return;

        activeChat.messages = activeChat.messages.filter(m => m.id !== msgId);
        window.saveHistoriesToLocal();
        
        const domBlock = document.getElementById(`msg-block-${msgId}`);
        if (domBlock) {
            domBlock.style.transition = 'all 0.25s ease';
            domBlock.style.opacity = '0';
            domBlock.style.transform = 'scale(0.95)';
            setTimeout(() => { domBlock.remove(); }, 250);
        }
    };

    if (window.tg?.showConfirm) {
        window.tg.showConfirm(window.getLangString('confirm_del_msg'), (ok) => { if (ok) action(); });
    } else if (confirm(window.getLangString('confirm_del_msg'))) {
        action();
    }
};

window.addMessageToStorage = function(text, className) {
    if (!window.chatHistories[window.currentTopic]) window.chatHistories[window.currentTopic] = [];
    const activeChat = window.getCurrentActiveChat();

    const generatedMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    if (activeChat) {
        activeChat.messages.push({ 
            id: generatedMsgId, 
            text: text, 
            type: className 
        });
        
        // Автопереименование работает только если пользователь еще не менял название сам
        const sectionName = window.topicNames[window.currentTopic] || window.currentTopic;
        const startTitle = `${window.getLangString('start_chat')} "${sectionName}"`;
        if (className === 'user-msg' && (!activeChat.userRenamed || activeChat.title === startTitle)) {
            activeChat.title = text.substring(0, 18) + (text.length > 18 ? '...' : '');
        }
    }

    window.saveHistoriesToLocal();
    if (typeof window.renderMessageToDOM === 'function') window.renderMessageToDOM(text, className, generatedMsgId);
    if (typeof window.renderHistoryChatsList === 'function') window.renderHistoryChatsList();
};
