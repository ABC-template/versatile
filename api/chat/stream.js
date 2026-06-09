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

        // ТОТАЛЬНАЯ СТРАХОВКА: Если есть фото — сразу выставляем зрячую модель, минуя любые ветвления!
        let openRouterModelId = 'openai/gpt-5.4';
        let rolePrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
        let temperature = 0.4;

        // Только если фото НЕТ, мы имеем право включить слепые текстовые модели разделов
        if (!attachedImage || attachedImage.trim().length === 0) {
            temperature = 0.5;
            if (currentTopic === 'code') {
                openRouterModelId = 'deepseek/deepseek-chat';
                rolePrompt = 'Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо.';
                temperature = 0.3;
            } else if (currentTopic === 'creative') {
                openRouterModelId = 'openai/gpt-4o';
                rolePrompt = 'Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений.';
                temperature = 0.9;
            } else if (currentTopic === 'fast') {
                openRouterModelId = 'google/gemini-2.5-flash';
                rolePrompt = 'Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий и вводных слов.';
            } else if (currentTopic === 'kitchen') {
                openRouterModelId = 'google/gemini-2.5-flash';
                rolePrompt = 'Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты и объясняешь сложные кулинарные техники простым языком.';
                temperature = 0.6;
            }
        }

        const langInstruction = getLanguageInstruction(userLang || 'ru');
        const finalSystemPrompt = `${rolePrompt}\n\n${langInstruction}`;

        const formattedMessages = [
            { role: 'system', content: finalSystemPrompt }
        ];

        // СБОРКА МУЛЬТИМОДАЛЬНОГО КОНТЕКСТА ДЛЯ OPENROUTER
        historyMessages.forEach((msg, index) => {
            const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
            if (!msg.text || msg.text.trim().length === 0) return;

            let textContent = String(msg.text);

            if (role === 'user' && textContent.includes('📸 [Прикреплено изображение]')) {
                textContent = textContent.replace('📸 [Прикреплено изображение]\n', '').trim();

                // Если фото есть и это финальная реплика — пакуем строго по спецификации OpenRouter Vision
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
