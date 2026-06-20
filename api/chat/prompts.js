// ============================================
// api/chat/prompts.js
// Описание: Системные промпты для ИИ
// ============================================

/**
 * Собрать системный промпт
 * @param {string} topic - Топик
 * @param {string} userLang - Язык пользователя
 * @param {boolean} isVision - Режим зрения
 * @param {string} extraInstructions - Дополнительные инструкции
 * @returns {string}
 */
export function buildSystemPrompt(topic, userLang = 'ru', isVision = false, extraInstructions = '') {
    const configs = {
        code: {
            prompt: 'Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо.'
        },
        creative: {
            prompt: 'Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений.'
        },
        fast: {
            prompt: 'Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий и вводных слов.'
        },
        kitchen: {
            prompt: 'Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты и объясняешь сложные кулинарные техники простым языком.'
        },
        analytics: {
            prompt: 'Ты — Versatile AI, аналитик. Помогаешь анализировать данные, делать выводы и структурировать информацию.'
        },
        vision: {
            prompt: 'Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.'
        },
        default: {
            prompt: 'Ты — Versatile AI, универсальный и полезный ассистент.'
        }
    };
    
    let basePrompt = configs.vision?.prompt || configs.default.prompt;
    
    if (isVision) {
        basePrompt = configs.vision.prompt;
    } else {
        const config = configs[topic] || configs.default;
        basePrompt = config.prompt;
    }
    
    // Добавляем языковую инструкцию
    const langMap = {
        ru: 'русском языке',
        en: 'английском языке',
        it: 'итальянском языке'
    };
    const targetLangStr = langMap[userLang] || 'русском языке';
    const langInstruction = `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;
    
    let finalPrompt = `${basePrompt}\n\n${langInstruction}`;
    
    if (extraInstructions) {
        finalPrompt += `\n\n${extraInstructions}`;
    }
    
    return finalPrompt;
}

/**
 * Собрать сообщения для OpenRouter
 * @param {string} systemPrompt - Системный промпт
 * @param {Array} historyMessages - История сообщений
 * @param {string} attachedImage - Base64 изображение (опционально)
 * @param {string} userMessage - Текущее сообщение пользователя (опционально)
 * @returns {Array} - Массив сообщений для API
 */
export function buildMessages(systemPrompt, historyMessages = [], attachedImage = null, userMessage = null) {
    const messages = [];
    
    // Добавляем системный промпт
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    
    let lastRole = null;
    
    // Добавляем историю
    for (const msg of historyMessages) {
        const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
        const text = String(msg.text || '').trim();
        
        if (!text) continue;
        
        // Пропускаем дублирующиеся роли
        if (lastRole === role) continue;
        
        messages.push({ role, content: text });
        lastRole = role;
    }
    
    // Добавляем текущее сообщение пользователя
    if (userMessage) {
        const hasImage = attachedImage && attachedImage.trim().length > 0;
        const cleanedText = userMessage.replace('📸 [Прикреплено изображение]', '').trim() || 'Что изображено на фото?';
        
        if (hasImage) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: cleanedText },
                    {
                        type: 'image_url',
                        image_url: {
                            url: attachedImage,
                            detail: 'high'
                        }
                    }
                ]
            });
        } else {
            messages.push({ role: 'user', content: cleanedText });
        }
    }
    
    return messages;
}
