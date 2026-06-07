// api /chat /stream.js (Часть 1 из 2)
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const config = { runtime: 'edge' };

function getRotatedKeysPool() {
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

function getLanguageInstruction(userLang) {
    const langMap = { ru: 'русском языке', en: 'английском языке', it: 'итальянском языке' };
    const targetLangStr = langMap[userLang] || 'русском языке';
    return `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;
}

export default async function handler(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        const { historyMessages = [], currentTopic, userLang, attachedImage } = await request.json();

        let openRouterModelId = 'google/gemini-2.5-flash';
        let rolePrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
        let temperature = 0.5;

        if (currentTopic === 'code') {
            openRouterModelId = 'deepseek/deepseek-chat';
            rolePrompt = 'Ты — Versatile AI, Senior Developer и системный архитектор. Специализация — чистый, производительный код.';
            temperature = 0.3;
        } else if (currentTopic === 'creative') {
            openRouterModelId = 'openai/gpt-4o';
            rolePrompt = 'Ты — Versatile AI, гениальный креативный копирайтер. Пиши живым, эмоциональным языком без штампов.';
            temperature = 0.9;
        } else if (currentTopic === 'fast') {
            openRouterModelId = 'google/gemini-2.5-flash';
            rolePrompt = 'Ты — Versatile AI в режиме экспресс-ответов. Выдавай только короткую и сжатую суть без лишней воды.';
            temperature = 0.5;
        } else if (currentTopic === 'kitchen') {
            openRouterModelId = 'google/gemini-2.5-flash';
            rolePrompt = 'Ты — Versatile AI, шеф-повар со звездами Мишлен. Помогаешь составлять меню и находить рецепты.';
            temperature = 0.6;
        }

        // Если прилетела картинка, жестко фиксируем мультимодальную зрячую модель
        if (attachedImage && attachedImage.trim().length > 0) {
            openRouterModelId = 'google/gemini-2.5-flash';
            temperature = 0.4;
        }

        const langInstruction = getLanguageInstruction(userLang || 'ru');
        const finalSystemPrompt = `${rolePrompt}\n\n${langInstruction}`;

        const formattedMessages = [
            { role: 'system', content: finalSystemPrompt }
        ];

        // УМНЫЙ ПАРСИНГ ИСТОРИИ С ИНТЕГРАЦИЕЙ МУЛЬТИМОДАЛЬНОСТИ
        historyMessages.forEach((msg, index) => {
            const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
            if (!msg.text || msg.text.trim().length === 0) return;

            let textContent = String(msg.text);

            // Если в тексте сообщения обнаружена наша новая визуальная заглушка
            if (role === 'user' && textContent.includes('📸 [Прикреплено изображение]')) {
                // Очищаем системный маркер из текста, чтобы он не улетал в промпт нейросети
                textContent = textContent.replace('📸 [Прикреплено изображение]\n', '').trim();

                // Упаковываем сообщение в строгий Vision-формат OpenRouter
                if (attachedImage && index === historyMessages.length - 1) {
                    formattedMessages.push({
                        role: 'user',
                        content: [
                            { type: 'text', text: textContent },
                            { type: 'image_url', image_url: { url: attachedImage } }
                        ]
                    });
                    return;
                }
            }

            // Обычный плоский текст для всех остальных реплик истории
            formattedMessages.push({ role: role, content: textContent });
        });

        const keysPool = getRotatedKeysPool();
        if (keysPool.length === 0) {
            return new Response(JSON.stringify({ error: 'Серверные API ключи ROUTER_KEY не настроены в Vercel.' }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }
        // api /chat /stream.js (Часть 2 из 2)

        // 3. ОТКАЗОУСТОЙЧИВЫЙ ЦИКЛ ОБРАБОТКИ ЗАПРОСА ЧЕРЕЗ ПУЛ КЛЮЧЕЙ
        let lastError = null;
        
        for (let k = 0; k < keysPool.length; k++) {
            const currentKey = keysPool[k];
            
            try {
                const provider = createOpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: currentKey,
                });

                // Запускаем текстовый стрим
                const result = await streamText({
                    model: provider(openRouterModelId),
                    messages: formattedMessages,
                    headers: {
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Telegram Mini App Versatile AI',
                    },
                    temperature: temperature,
                });

                // Возвращаем чистый текстовый ответ и выходим из функции
                return result.toTextStreamResponse({
                    headers: {
                        'X-Accel-Buffering': 'no',
                        'Cache-Control': 'no-cache, no-transform',
                        'Content-Type': 'text/plain; charset=utf-8',
                    }
                });

            } catch (err) {
                console.error(`Сбой запроса с ключом ROUTER_KEY${k}:`, err.message);
                lastError = err;
                
                // Failover: если токен перегружен, переходим к следующему в цикле
                continue;
            }
        }

        // Если дошли сюда, значит ни один ключ из пула не сработал
        return new Response(JSON.stringify({ 
            error: `Все доступные API-ключи перегружены или неактивны. Последний сбой: ${lastError?.message || 'Неизвестная ошибка'}` 
        }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Критическое исключение сервера: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
