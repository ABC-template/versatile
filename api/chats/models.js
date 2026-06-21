// ============================================
// api/chat/models.js
// Описание: Конфигурация моделей ИИ
// ============================================

/**
 * Конфигурации моделей по топикам
 */
export const MODEL_CONFIGS = {
    code: {
        model: 'deepseek/deepseek-chat',
        temperature: 0.3,
        systemPrompt: 'Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо.'
    },
    creative: {
        model: 'openai/gpt-4o',
        temperature: 0.9,
        systemPrompt: 'Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений.'
    },
    fast: {
        model: 'google/gemini-2.5-flash',
        temperature: 0.5,
        systemPrompt: 'Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий и вводных слов.'
    },
    kitchen: {
        model: 'google/gemini-2.5-flash',
        temperature: 0.6,
        systemPrompt: 'Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты и объясняешь сложные кулинарные техники простым языком.'
    },
    analytics: {
        model: 'openai/gpt-5',
        temperature: 0.4,
        systemPrompt: 'Ты — Versatile AI, аналитик. Помогаешь анализировать данные, делать выводы и структурировать информацию.'
    },
    default: {
        model: 'openai/gpt-5',
        temperature: 0.4,
        systemPrompt: 'Ты — Versatile AI, универсальный и полезный ассистент.'
    },
    vision: {
        model: 'openai/gpt-5',
        temperature: 0.4,
        systemPrompt: 'Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.'
    }
};

/**
 * Получить конфигурацию для топика
 * @param {string} topic - Топик (code, creative, fast, kitchen, analytics)
 * @param {boolean} isVision - Режим зрения
 * @returns {object} - Конфигурация модели
 */
export function getModelConfig(topic, isVision = false) {
    if (isVision) {
        return MODEL_CONFIGS.vision;
    }
    
    return MODEL_CONFIGS[topic] || MODEL_CONFIGS.default;
}

/**
 * Получить языковую инструкцию
 * @param {string} userLang - Язык пользователя (ru, en, it)
 * @returns {string}
 */
export function getLanguageInstruction(userLang = 'ru') {
    const langMap = {
        ru: 'русском языке',
        en: 'английском языке',
        it: 'итальянском языке'
    };
    const targetLangStr = langMap[userLang] || 'русском языке';
    return `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;
}

/**
 * Получить список ключей OpenRouter
 * @returns {string[]}
 */
export function getRotatedKeysPool() {
    const keys = [];
    let i = 0;
    while (true) {
        const key = process.env[`ROUTER_KEY${i}`];
        if (!key || key.trim().length === 0) break;
        keys.push(key.trim());
        i++;
    }
    return keys;
}

/**
 * Проверить, есть ли доступные ключи
 * @returns {boolean}
 */
export function hasAvailableKeys() {
    const keys = getRotatedKeysPool();
    return keys.length > 0;
}
