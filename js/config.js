// js /config.js

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
window.currentTopic = 'code'; // Храним ID активной темы вместо модели
window.usedToday = 0;
window.chatHistories = {}; 
window.activeChatIds = { code: null, creative: null, fast: null, kitchen: null, analytics: null }; 

window.isSendingMessage = false;
window.isVoiceRecording = false;
window.mediaRecorder = null;
window.audioChunks = [];

window.topicNames = { 
    code: 'Программирование и код', 
    creative: 'Творчество и тексты', 
    fast: 'Быстрый флуд',
    kitchen: 'Рецепты и Кулинария',
    analytics: 'Аналитика и Фото'
}; 

window.welcomeTexts = {
    code: "Привет! На связи Versatile AI в режиме Разработчика. Помогу написать чистый код, исправить баги или спроектировать архитектуру приложения. Какой проект разберем? 💻",
    creative: "Приветствую! Режим Креатора активирован. Готов написать живой текст, сценарий, рекламный пост или сгенерировать яркие идеи без канцеляризмов. Какая творческая задача стоит перед нами? ✨",
    fast: "Йоу! На связи Versatile AI. Короткие и емкие ответы без лишней воды. Спрашивай, разберемся быстро! ⚡",
    kitchen: "Добро пожаловать на виртуальную кухню Versatile AI! Помогу составить меню, найду идеальный рецепт из того, что есть в холодильнике, или раскрою секреты шеф-поваров. Что приготовим? 🍳",
    analytics: "Режим Аналитика. Готов к глубокому разбору логических задач, анализу документов и данных. (Функция анализа фото будет доступна создателю) 📊"
};
// Мгновенная нативная инициализация среды Telegram SDK
window.tg = window.Telegram?.WebApp;
if (window.tg) {
    window.tg.expand();
    window.tg.ready();
    if (window.tg.themeParams && window.tg.themeParams.bg_color) {
        window.tg.setHeaderColor(window.tg.themeParams.bg_color);
        window.tg.setBackgroundColor(window.tg.themeParams.bg_color);
    }
}

// Глобальные переменные состояния конфигурации приложения
window.config = { dailyLimit: 0, role: 'trial', serverModels: {} };
window.currentModel = 'gemini'; 
window.allUserKeys = {}; 
window.usedToday = 0;
window.chatHistories = {}; 
window.activeChatIds = { gemini: null, deepseek: null, gpt: null, claude: null, grok: null }; 

// Флаги управления процессами
window.isSendingMessage = false;
window.isVoiceRecording = false;
window.mediaRecorder = null;
window.audioChunks = [];

// Словари названий ИИ-моделей для интерфейса
window.modelNames = { 
    gemini: 'Gemini 2.5', 
    deepseek: 'DeepSeek V3', 
    gpt: 'GPT-4o', 
    claude: 'Claude 3.5', 
    grok: 'Grok 4.3' 
}; 
