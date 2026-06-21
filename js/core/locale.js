// ============================================
// js/core/locale.js
// Описание: Локализация интерфейса
// ============================================

window.locales = {
    ru: {
        "new_chat": "+ Новый чат",
        "limit": "Лимит",
        "beta": "🚀 Versatile AI — Beta Версия",
        "sync": "Синхронизация...",
        "organizer_title": "📅 Органайзер Прогресса",
        "dialogs": "Ваши диалоги:",
        "fav_title": "⭐ Избранные ответы:",
        "no_fav": "У вас пока нет избранных ответов.",
        "placeholder": "Ваш вопрос...",
        "memory": "🧠 Память чата",
        "memory_hint": "Память определяет число прошлых реплик, отправляемых ИИ.<br>• <strong>Меньше:</strong> быстрей ответ и экономия токенов.<br>• <strong>Больше:</strong> ИИ идеально помнит нить беседы.",
        "memory_off": "1 (Выкл)",
        "memory_max": "40 сообщений",
        "beta_alert": "Данная функция находится в разработке (Beta) и появится в ближайших обновлениях приложения!",
        "confirm_del_chat": "Вы уверены, что хотите полностью удалить этот диалог?",
        "confirm_del_msg": "Удалить это сообщение из истории чата?",
        "confirm_unfav": "Убрать этот ответ из списка избранного?",
        "prompt_rename": "Введите новое название для этого диалога:",
        "start_chat": "Стартовый чат в разделе"
    },
    en: {
        "new_chat": "+ New Chat",
        "limit": "Limit",
        "beta": "🚀 Versatile AI — Beta Version",
        "sync": "Syncing...",
        "organizer_title": "📅 Progress Organizer",
        "dialogs": "Your dialogs:",
        "fav_title": "⭐ Favorite answers:",
        "no_fav": "You don't have any favorite answers yet.",
        "placeholder": "Your question...",
        "memory": "🧠 Chat Memory",
        "memory_hint": "Memory defines the number of past messages sent to the AI.<br>• <strong>Less:</strong> faster response and token saving.<br>• <strong>More:</strong> AI perfectly remembers the conversation thread.",
        "memory_off": "1 (Off)",
        "memory_max": "40 messages",
        "beta_alert": "This feature is under development (Beta) and will appear in upcoming app updates!",
        "confirm_del_chat": "Are you sure you want to completely delete this dialog?",
        "confirm_del_msg": "Delete this message from chat history?",
        "confirm_unfav": "Remove this answer from favorites?",
        "prompt_rename": "Enter a new name for this dialog:",
        "start_chat": "Start chat in"
    },
    it: {
        "new_chat": "+ Nuova Chat",
        "limit": "Limite",
        "beta": "🚀 Versatile AI — Versione Beta",
        "sync": "Sincronizzazione...",
        "organizer_title": "📅 Organizzatore",
        "dialogs": "I tuoi dialoghi:",
        "fav_title": "⭐ Risposte preferite:",
        "no_fav": "Non hai ancora risposte preferite.",
        "placeholder": "La tua domanda...",
        "memory": "🧠 Memoria della Chat",
        "memory_hint": "La memoria definisce il numero di messaggi passati inviati all'IA.<br>• <strong>Meno:</strong> risposta più rapida e risparmio di token.<br>• <strong>Più:</strong> L'IA ricorda perfettamente il filo della conversazione.",
        "memory_off": "1 (Disattivato)",
        "memory_max": "40 messaggi",
        "beta_alert": "Questa funzione è in fase di sviluppo (Beta) e apparirà nei prochains aggiornamenti dell'app!",
        "confirm_del_chat": "Sei sicuro di voler eliminare completamente questo dialogo?",
        "confirm_del_msg": "Eliminare questo messaggio dalla cronologia della chat?",
        "confirm_unfav": "Rimuovere questa risposta dai preferiti?",
        "prompt_rename": "Inserisci un nuovo nome per questo dialogo:",
        "start_chat": "Chat iniziale in"
    }
};

// ==========================================
// ПОЛУЧЕНИЕ ЛОКАЛИЗОВАННОЙ СТРОКИ
// ==========================================

window.getLangString = function(key) {
    const currentChat = window.getCurrentActiveChat();
    // Приоритет: язык текущего чата -> системный язык TG -> русский по умолчанию
    const lang = currentChat?.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
    const activeLocale = window.locales[lang] || window.locales['ru'];
    return activeLocale[key] || window.locales['ru'][key] || key;
};

// ==========================================
// ПРИМЕНЕНИЕ ЛОКАЛИЗАЦИИ КО ВСЕМУ UI
// ==========================================

window.applyUiLocalization = function() {
    const ids = {
        'limit-info': 'limit',
        'new-chat-btn': 'new_chat',
        'dialogs-label': 'dialogs',
        'fav-title-label': 'fav_title',
        'memory-label': 'memory',
        'memory-hint-content': 'memory_hint',
        'memory-off-label': 'memory_off',
        'memory-max-label': 'memory_max'
    };
    
    const elOrg = document.getElementById('organizer-title-label');
    if (elOrg) elOrg.innerText = window.getLangString('organizer_title');
    
    Object.keys(ids).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (ids[id] === 'memory_hint') {
                el.innerHTML = window.getLangString(ids[id]);
            } else {
                el.innerText = window.getLangString(ids[id]);
            }
        }
    });

    const userInput = document.getElementById('user-input');
    if (userInput) userInput.placeholder = window.getLangString('placeholder');
    
    // Обновляем отображение лимита
    window.updateLimitDisplay();
};

// ==========================================
// ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ЛИМИТА
// ==========================================

window.updateLimitDisplay = function() {
    const info = document.getElementById('limit-info');
    if (!info) return;
    
    const userStore = window.userStore;
    if (!userStore) return;
    
    const total = userStore.dailyLimit || 0;
    const used = userStore.usedToday || 0;
    
    // Получаем локализованное слово "Лимит"
    const limitLabel = window.getLangString ? window.getLangString('limit') : 'Лимит';
    
    if (total >= 9999) {
        info.innerText = `${limitLabel}: ∞`;
    } else {
        info.innerText = `${limitLabel}: ${used}/${total}`;
    }
};

console.log('✅ locale.js загружен');
