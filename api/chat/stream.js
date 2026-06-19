import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

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
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
        const initData = request.headers.get('x-telegram-init-data');
        if (!initData) {
            return new Response(JSON.stringify({ error: 'Missing init data' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const botToken = process.env.BOT_TOKEN?.trim();
        if (!botToken) {
            return new Response(JSON.stringify({ error: 'Серверный токен BOT_TOKEN не настроен в Vercel.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const user = await validateTelegramInitData(initData, botToken);
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid init data' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const userId = user.id;
        const MY_TELEGRAM_ID = 1541531808;

        const { historyMessages = [], currentTopic, userLang, attachedImage } = await request.json();

        // Проверка: только создатель может отправлять изображения
        if (attachedImage && attachedImage.trim().length > 0 && userId !== MY_TELEGRAM_ID) {
            return new Response(JSON.stringify({ 
                error: '📸 Отправка изображений доступна только создателю приложения' 
            }), { 
                status: 403, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        let openRouterModelId = 'openai/gpt-5';
        let rolePrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
        let temperature = 0.4;

        // Только если фото НЕТ, используем текстовые модели
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
            } else if (currentTopic === 'analytics') {
                openRouterModelId = 'openai/gpt-5.4';
                rolePrompt = 'Ты — Versatile AI, аналитик. Помогаешь анализировать данные, делать выводы и структурировать информацию.';
                temperature = 0.4;
            }
        } else {
            rolePrompt = 'Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.';
        }

        const langInstruction = getLanguageInstruction(userLang || 'ru');
        const finalSystemPrompt = `${rolePrompt}\n\n${langInstruction}`;

        // ==========================================
        // ПРАВИЛЬНЫЙ VISION-ФОРМАТ ДЛЯ OPENROUTER
        // ==========================================
        const formattedMessages = [
            { role: 'system', content: finalSystemPrompt }
        ];

        // Обрабатываем историю сообщений
        for (let i = 0; i < historyMessages.length; i++) {
            const msg = historyMessages[i];
            const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
            
            if (!msg.text || msg.text.trim().length === 0) continue;

            let textContent = String(msg.text);
            const isLastUserMessage = (role === 'user' && i === historyMessages.length - 1);
            const hasImage = attachedImage && attachedImage.trim().length > 0 && isLastUserMessage;
            const hasImageMarker = textContent.includes('📸 [Прикреплено изображение]');

            if (hasImageMarker && hasImage) {
                // Убираем маркер изображения
                textContent = textContent.replace('📸 [Прикреплено изображение]\n', '').trim();
                if (!textContent) textContent = 'Что изображено на фото?';
                
                // ПРАВИЛЬНЫЙ ФОРМАТ ДЛЯ OPENROUTER VISION
                // Используем структуру content как массив с типами text и image_url
                formattedMessages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: textContent },
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
                // Проверяем, не было ли уже такого сообщения
                const lastMsg = formattedMessages[formattedMessages.length - 1];
                if (lastMsg && lastMsg.role === role && typeof lastMsg.content === 'string' && lastMsg.content === textContent) {
                    continue;
                }
                formattedMessages.push({ role: role, content: textContent });
            }
        }

        console.log('📨 [stream.js] formattedMessages length:', formattedMessages.length);
        console.log('📨 [stream.js] Последнее сообщение type:', typeof formattedMessages[formattedMessages.length - 1].content);

        const keysPool = getRotatedKeysPool();
        if (keysPool.length === 0) {
            return new Response(JSON.stringify({ error: 'Серверные API ключи ROUTER_KEY не настроены в Vercel.' }), {
                status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
           
        let lastError = null;
        
        for (let k = 0; k < keysPool.length; k++) {
            const currentKey = keysPool[k];
            
            try {
                const provider = createOpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: currentKey,
                });

                console.log('🚀 [stream.js] Отправляем запрос к модели:', openRouterModelId);

                const result = await streamText({
                    model: provider(openRouterModelId),
                    messages: formattedMessages,
                    headers: {
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Telegram Mini App Versatile AI',
                    },
                    temperature: temperature,
                });

                return result.toTextStreamResponse({
                    headers: {
                        'X-Accel-Buffering': 'no',
                        'Cache-Control': 'no-cache, no-transform',
                        'Content-Type': 'text/plain; charset=utf-8',
                        ...corsHeaders
                    }
                });

            } catch (err) {
                console.error(`Сбой запроса с ключом ROUTER_KEY${k}:`, err.message);
                console.error('Детали ошибки:', err);
                lastError = err;
                continue;
            }
        }

        return new Response(JSON.stringify({ 
            error: `Все доступные API-ключи перегружены или неактивны. Последний сбой: ${lastError?.message || 'Неизвестная ошибка'}` 
        }), { 
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });

    } catch (err) {
        console.error('Критическое исключение:', err);
        return new Response(JSON.stringify({ error: `Критическое исключение сервера: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
}
