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

// Фирменные приветственные анонсы характеров ИИ при старте диалога
window.welcomeTexts = {
    gemini: "Привет! Я Gemini 2.5 — мультимодальный ИИ от Google. Быстро анализирую информацию и помогаю решать любые задачи. Чем займемся сегодня? 🚀",
    deepseek: "Здравствуйте! Я DeepSeek V3 — высокоэффективная языковая модель. Готов к глубокому анализу, математическим расчетам и точной работе с текстом. Какой у вас вопрос? 🧠",
    gpt: "Привет! Я GPT-4o — флагманский ассистент от OpenAI. С легкостью пишу тексты, генерирую идеи и поддерживаю любой диалог. О чем хотите поговорить? ✨",
    claude: "Приветствую! Я Claude 3.5 Sonnet от Anthropic. Моя сильная сторона — сложная аналитика, идеальный контент и внимание к деталям. Расскажите о вашей задаче! 📝",
    grok: "Йоу! На связи Grok 4.3 от xAI Илона Маска. Смотрю на мир с юмором, люблю острые темы и готов выдать максимум полезной информации. Что тебя интересует? ⚡"
};
