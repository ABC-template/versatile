// api /chat /stream.js (Часть 1 из 2)
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const config = { runtime: 'edge' };

// Вспомогательная функция сбора всех доступных ключей ротации из переменных окружения vercel
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

// Генератор умной языковой инструкции, исключающий "эффект австралийца"
function getLanguageInstruction(userLang) {
    const langMap = {
        ru: 'русском языке',
        en: 'английском языке',
        it: 'итальянском языке'
    };
    const targetLangStr = langMap[userLang] || 'русском языке';
    
    return `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;
}

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { historyMessages = [], currentTopic, userLang } = await request.json();

        // 1. ОПРЕДЕЛЯЕМ МОДЕЛЕЙ-ИСПОЛНИТЕЛЕЙ И СИСТЕМНЫЕ ПРОМПТЫ ДЛЯ КАЖДОЙ ТЕМЫ
        let openRouterModelId = 'google/gemini-2.5-flash';
        let rolePrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
        let temperature = 0.5;

        if (currentTopic === 'code') {
            openRouterModelId = 'deepseek/deepseek-chat';
            rolePrompt = 'Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо.';
            temperature = 0.3;
        } else if (currentTopic === 'creative') {
            openRouterModelId = 'openai/gpt-4o';
            rolePrompt = 'Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений. Используй метафоры и сильные глаголы.';
            temperature = 0.9;
        } else if (currentTopic === 'fast') {
            openRouterModelId = 'google/gemini-2.5-flash';
            rolePrompt = 'Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий, вводных слов и вежливых завершений диалога. Экономь время пользователя.';
            temperature = 0.5;
        } else if (currentTopic === 'kitchen') {
            openRouterModelId = 'google/gemini-2.5-flash';
            rolePrompt = 'Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты, заменять недостающие ингредиенты и объясняешь сложные кулинарные техники простым языком.';
            temperature = 0.6;
        }

        // Собираем воедино системную роль и языковой барьер
        const langInstruction = getLanguageInstruction(userLang || 'ru');
        const finalSystemPrompt = `${rolePrompt}\n\n${langInstruction}`;

        // 2. СБОРКА КОНТЕКСТА: Системный промпт ВСЕГДА идет первым элементом
        const formattedMessages = [
            { role: 'system', content: finalSystemPrompt }
        ];

        historyMessages.forEach(msg => {
            const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
            if (msg.text && msg.text.trim().length > 0) {
                formattedMessages.push({ role: role, content: String(msg.text) });
            }
        });

        // Считываем пул доступных ключей ROUTER_KEY0, ROUTER_KEY1...
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
                    baseURL: 'https://openrouter.ai',
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
                
                // Если это последний ключ в массиве — цикл завершится и выдаст общую ошибку
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
