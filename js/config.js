// js/config.js
window.tg = window.Telegram?.WebApp;
if (window.tg) {
    window.tg.expand();
    window.tg.ready();
    if (window.tg.themeParams && window.tg.themeParams.bg_color) {
        window.tg.setHeaderColor(window.tg.themeParams.bg_color);
        window.tg.setBackgroundColor(window.tg.themeParams.bg_color);
    }
}

window.config = { dailyLimit: 0, role: 'trial', serverModels: {} };
window.currentTopic = 'code';
window.currentModel = 'gemini';
window.usedToday = 0;
window.allUserKeys = {};
window.chatHistories = {};
window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null };
window.isSendingMessage = false;
window.isVoiceRecording = false;
window.mediaRecorder = null;
window.audioChunks = [];

// ==========================================
// НАЗВАНИЯ ТЕГОВ
// ==========================================
window.topicNames = {
    code: '#кодинг',
    creative: '#креатив',
    fast: '#флуд',
    kitchen: '#кухня',
    analytics: '#аналитика'
};

window.topicShortNames = {
    code: '#кодинг',
    creative: '#креатив',
    fast: '#флуд',
    kitchen: '#кухня',
    analytics: '#аналитика'
};

// ==========================================
// ПРИВЕТСТВИЯ (ПРОСТО ТЕКСТ, НЕ СООБЩЕНИЯ)
// ==========================================
window.welcomeTexts = {
    code: "Привет! Я Versatile AI в режиме Кодинга. Помогу написать чистый код, исправить баги или спроектировать архитектуру. Какой проект разберем? 💻",
    creative: "Привет! Режим Креатива активирован. Готов написать текст, сценарий, рекламный пост или сгенерировать идеи. Какая задача? ✨",
    fast: "Йоу! Я Versatile AI в режиме Флуда. Короткие и емкие ответы без лишней воды. Спрашивай! ⚡",
    kitchen: "Добро пожаловать на кухню Versatile AI! Помогу с рецептами, меню или секретами шеф-поваров. Что готовим? 🍳",
    analytics: "Режим Аналитики. Готов к разбору задач, анализу данных и документов. (Функция в разработке) 📊"
};

window.modelNames = {
    gemini: 'Gemini 2.5',
    deepseek: 'DeepSeek V3',
    gpt: 'GPT-4o',
    claude: 'Claude 3.5',
    grok: 'Grok 4.3'
};

console.log('✅ config.js загружен');
