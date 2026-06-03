// api /chat /stream.js
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const config = { runtime: 'edge' };

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { historyMessages = [], userKey, currentModel } = await request.json();

        // 1. ОПРЕДЕЛЯЕМ СИСТЕМНЫЙ КЛЮЧ И СТАНДАРТНЫЙ ID МОДЕЛИ ДЛЯ OPENROUTER
        let systemKey = process.env.OPENAI_KEY?.trim() || process.env.XAI_KEY?.trim();
        let openRouterModelId = 'google/gemini-2.5-flash';

        if (currentModel === 'gemini') {
            systemKey = process.env.BOT_IN?.trim() || systemKey;
            openRouterModelId = 'google/gemini-2.5-flash';
        } else if (currentModel === 'deepseek') {
            systemKey = process.env.BOT_DS?.trim() || systemKey;
            openRouterModelId = 'deepseek/deepseek-chat';
        } else if (currentModel === 'gpt') {
            systemKey = process.env.OPENAI_KEY?.trim() || systemKey;
            openRouterModelId = 'openai/gpt-4o';
        } else if (currentModel === 'claude') {
            systemKey = process.env.ANTHROPIC_KEY?.trim() || systemKey;
            openRouterModelId = 'anthropic/claude-3.5-sonnet';
        } else if (currentModel === 'grok') {
            systemKey = process.env.XAI_KEY?.trim() || systemKey;
            openRouterModelId = 'x-ai/grok-2';
        }

        // Если у пользователя есть личный ключ, приоритет отдается ему
        const finalKey = (userKey && userKey.trim().length > 0) ? userKey.trim() : systemKey;

        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'API ключ не найден на сервере Vercel.' }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. ИНИЦИАЛИЗИРУЕМ ДИНАМИЧЕСКИЙ ПРОВАЙДЕР
        // Если юзер ввел личный ключ Gemini, шлем на нативный Google API, иначе все шлем через OpenRouter
        const isNativeGemini = currentModel === 'gemini' && userKey && !userKey.startsWith('sk-');
        
        let provider;
        if (isNativeGemini) {
            // Для простоты и универсальности на Edge, даже для Gemini используем OpenAI-совместимый эндпоинт OpenRouter,
            // но если вам нужен жесткий OpenRouter шлюз — пускаем всё через него:
            provider = createOpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: finalKey,
            });
        } else {
            provider = createOpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: finalKey,
            });
        }

        // 3. ФОРМАТИРУЕМ ИСТОРИЮ СООБЩЕНИЙ ПО СТАНДАРТУ AI SDK
        const messages = historyMessages.map(msg => ({
            role: (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant',
            content: String(msg.text || '')
        })).filter(m => m.content.trim().length > 0);

        // 4. ЗАПУСКАЕМ ПОТОКОВЫЙ ТЕКСТ
        const result = streamText({
            model: provider(openRouterModelId),
            messages: messages,
            headers: {
                'HTTP-Referer': 'https://vercel.com',
                'X-Title': 'Telegram Mini App Bot',
            },
            temperature: currentModel === 'grok' ? 0.8 : 0.5,
        });

        // ПРЕВРАЩАЕМ В ЧИСТЫЙ ТЕКСТОВЫЙ СТРИМ (Без мусорных префиксов Vercel)
        return result.toTextStreamResponse({
            headers: {
                'X-Accel-Buffering': 'no', // Убивает буферизацию Vercel намертво
                'Cache-Control': 'no-cache, no-transform',
                'Content-Type': 'text/plain; charset=utf-8',
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
