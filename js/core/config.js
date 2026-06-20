// ============================================
// js/core/config.js
// Описание: Конфигурация приложения
// ============================================

console.log('✅ Config загружен');

// Telegram
window.tg = window.Telegram?.WebApp;
if (window.tg) {
    try {
        window.tg.expand();
        window.tg.ready();
        if (window.tg.themeParams && window.tg.themeParams.bg_color) {
            window.tg.setHeaderColor(window.tg.themeParams.bg_color);
            window.tg.setBackgroundColor(window.tg.themeParams.bg_color);
        }
    } catch (e) {
        console.error('Ошибка инициализации Telegram:', e);
    }
}

// ==========================================
// КОНФИГУРАЦИЯ
// ==========================================

window.config = {
    dailyLimit: 0,
    role: 'trial',
    serverModels: {},
    syncEnabled: false
};

// Текущие топики
window.currentTopic = 'code';
window.currentModel = 'gemini';
window.currentFilter = 'all';

// Счетчики
window.usedToday = 0;
window.allUserKeys = {};

// Состояния
window.isSendingMessage = false;
window.isVoiceRecording = false;
window.mediaRecorder = null;
window.audioChunks = [];

// ==========================================
// НАЗВАНИЯ ТОПИКОВ
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
// ПРИВЕТСТВИЯ
// ==========================================

window.welcomeTexts = {
    code: 'Привет! Я Versatile AI в режиме Кодинга. Помогу написать чистый код, исправить баги или спроектировать архитектуру. Какой проект разберем? 💻',
    creative: 'Привет! Режим Креатива активирован. Готов написать текст, сценарий, рекламный пост или сгенерировать идеи. Какая задача? ✨',
    fast: 'Йоу! Я Versatile AI в режиме Флуда. Короткие и емкие ответы без лишней воды. Спрашивай! ⚡',
    kitchen: 'Добро пожаловать на кухню Versatile AI! Помогу с рецептами, меню или секретами шеф-поваров. Что готовим? 🍳',
    analytics: 'Режим Аналитики. Готов к разбору задач, анализу данных и документов. 📊'
};

// ==========================================
// НАЗВАНИЯ МОДЕЛЕЙ
// ==========================================

window.modelNames = {
    gemini: 'Gemini 2.5',
    deepseek: 'DeepSeek V3',
    gpt: 'GPT-4o',
    claude: 'Claude 3.5',
    grok: 'Grok 4.3'
};

console.log('✅ config.js загружен');
