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

// ==========================================
// ДОБАВЛЕНО: ВАЛИДАЦИЯ ИЗОБРАЖЕНИЙ
// ==========================================
function validateImageSize(base64String, maxSizeMB = 5) {
    if (!base64String) return { valid: true };
    const base64Length = base64String.length - (base64String.indexOf(',') + 1);
    const sizeInBytes = Math.ceil((base64Length * 3) / 4);
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return { 
        valid: sizeInMB <= maxSizeMB, 
        sizeInMB: Math.round(sizeInMB * 100) / 100 
    };
}

// ==========================================
// ДОБАВЛЕНО: ПРОВЕРКА ЛИМИТОВ
// ==========================================
async function checkDailyLimit(userId, supabaseUrl, supabaseKey) {
    const today = new Date().toISOString().slice(0, 10);
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/usage?user_id=eq.${userId}&date=eq.${today}&select=count`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            }
        });
        if (!res.ok) return { allowed: true, used: 0, limit: 5 };
        const data = await res.json();
        const used = data[0]?.count || 0;
        
        // Проверяем роль пользователя для определения лимита
        const userRes = await fetch(`${supabaseUrl}/rest/v1/users?telegram_id=eq.${userId}&select=role,premium_until`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            }
        });
        const userData = await userRes.json();
        const user = userData[0] || {};
        const isPremium = user.role === 'premium' && user.premium_until && new Date(user.premium_until) > new Date();
        const isAdmin = ['creator', 'admin'].includes(user.role);
        
        const dailyLimit = isAdmin ? 9999 : (isPremium ? 100 : 5);
        const allowed = isAdmin || used < dailyLimit;
        
        return { allowed, used, limit: dailyLimit };
    } catch (err) {
        console.error('Ошибка проверки лимита:', err);
        return { allowed: true, used: 0, limit: 5 };
    }
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
            return new Response(JSON.stringify({ error: 'BOT_TOKEN not configured' }), {
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

        console.log('📨 [stream.js] Тема:', currentTopic);
        console.log('📨 [stream.js] Есть фото:', !!attachedImage);
        console.log('📨 [stream.js] История:', historyMessages.length);

        // ==========================================
        // ДОБАВЛЕНО: ПРОВЕРКА РАЗМЕРА ИЗОБРАЖЕНИЯ
        // ==========================================
        if (attachedImage && attachedImage.trim().length > 0) {
            const validation = validateImageSize(attachedImage, 5);
            if (!validation.valid) {
                return new Response(JSON.stringify({ 
                    error: `Изображение слишком большое (${validation.sizeInMB}MB). Максимум 5MB.` 
                }), { 
                    status: 413, 
                    headers: { 'Content-Type': 'application/json', ...corsHeaders } 
                });
            }
        }

        if (attachedImage && attachedImage.trim().length > 0 && userId !== MY_TELEGRAM_ID) {
            return new Response(JSON.stringify({ 
                error: '📸 Отправка изображений доступна только создателю приложения' 
            }), { 
                status: 403, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        // ==========================================
        // ДОБАВЛЕНО: ПРОВЕРКА ДНЕВНОГО ЛИМИТА
        // ==========================================
        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
        
        if (supabaseUrl && supabaseKey) {
            const limitCheck = await checkDailyLimit(userId, supabaseUrl, supabaseKey);
            if (!limitCheck.allowed) {
                return new Response(JSON.stringify({ 
                    error: `Ежедневный лимит запросов исчерпан (${limitCheck.used}/${limitCheck.limit})` 
                }), { 
                    status: 429, 
                    headers: { 'Content-Type': 'application/json', ...corsHeaders } 
                });
            }
        }

        const keysPool = getRotatedKeysPool();
        if (keysPool.length === 0) {
            return new Response(JSON.stringify({ error: 'Серверные API ключи ROUTER_KEY не настроены в Vercel.' }), {
                status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // ==========================================
        // ВЫБОР МОДЕЛИ И ПРОМПТА
        // ==========================================
        let systemPrompt = '';
        let temperature = 0.4;
        let model = 'openai/gpt-5';

        if (attachedImage && attachedImage.trim().length > 0) {
            systemPrompt = 'Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.';
            temperature = 0.4;
            model = 'openai/gpt-5';
            console.log('📨 [stream.js] Используем VISION модель:', model);
        } else {
            temperature = 0.5;
            if (currentTopic === 'code') {
                model = 'deepseek/deepseek-chat';
                systemPrompt = 'Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо.';
                temperature = 0.3;
            } else if (currentTopic === 'creative') {
                model = 'openai/gpt-4o';
                systemPrompt = 'Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений.';
                temperature = 0.9;
            } else if (currentTopic === 'fast') {
                model = 'google/gemini-2.5-flash';
                systemPrompt = 'Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий и вводных слов.';
                temperature = 0.5;
            } else if (currentTopic === 'kitchen') {
                model = 'google/gemini-2.5-flash';
                systemPrompt = 'Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты и объясняешь сложные кулинарные техники простым языком.';
                temperature = 0.6;
            } else if (currentTopic === 'analytics') {
                model = 'openai/gpt-5';
                systemPrompt = 'Ты — Versatile AI, аналитик. Помогаешь анализировать данные, делать выводы и структурировать информацию.';
                temperature = 0.4;
            } else {
                model = 'openai/gpt-5';
                systemPrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
                temperature = 0.4;
            }
            console.log('📨 [stream.js] Используем текстовую модель:', model);
        }

        const langInstruction = getLanguageInstruction(userLang || 'ru');
        const finalSystemPrompt = `${systemPrompt}\n\n${langInstruction}`;

        // ==========================================
        // СБОРКА СООБЩЕНИЙ
        // ==========================================
        const openRouterMessages = [];
        openRouterMessages.push({ role: 'system', content: finalSystemPrompt });

        let lastRole = null;
        for (let i = 0; i < historyMessages.length; i++) {
            const msg = historyMessages[i];
            const role = (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant';
            
            if (!msg.text || msg.text.trim().length === 0) continue;

            let textContent = String(msg.text);
            const isLastUserMessage = (role === 'user' && i === historyMessages.length - 1);
            const hasImage = attachedImage && attachedImage.trim().length > 0 && isLastUserMessage;
            const hasImageMarker = textContent.includes('📸 [Прикреплено изображение]');

            if (lastRole === role && !hasImageMarker) continue;

            if (hasImageMarker && hasImage) {
                textContent = textContent.replace('📸 [Прикреплено изображение]\n', '').trim();
                if (!textContent) textContent = 'Что изображено на фото?';
                
                console.log('📨 [stream.js] Добавляем vision сообщение');
                openRouterMessages.push({
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
                lastRole = 'user';
            } else {
                openRouterMessages.push({ role: role, content: textContent });
                lastRole = role;
            }
        }

        if (attachedImage && attachedImage.trim().length > 0) {
            const lastMsg = openRouterMessages[openRouterMessages.length - 1];
            if (!lastMsg || lastMsg.role !== 'user' || typeof lastMsg.content === 'string') {
                console.log('📨 [stream.js] Добавляем дефолтное vision сообщение');
                openRouterMessages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Что изображено на фото?' },
                        { 
                            type: 'image_url', 
                            image_url: { 
                                url: attachedImage,
                                detail: 'high'
                            } 
                        }
                    ]
                });
            }
        }

        console.log('📨 [stream.js] Модель:', model);
        console.log('📨 [stream.js] Количество сообщений:', openRouterMessages.length);

        let lastError = null;
        
        for (let k = 0; k < keysPool.length; k++) {
            const currentKey = keysPool[k];
            
            try {
                console.log(`📨 [stream.js] Пробуем ключ ROUTER_KEY${k}`);
                
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Telegram Mini App Versatile AI'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: openRouterMessages,
                        temperature: temperature,
                        stream: true,
                        max_tokens: 4096
                    })
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    console.error(`❌ OpenRouter ошибка ${response.status}:`, errorData.substring(0, 200));
                    throw new Error(`OpenRouter API error ${response.status}: ${errorData.substring(0, 200)}`);
                }

                console.log('✅ [stream.js] OpenRouter ответил, начинаем стрим');

                // ==========================================
                // ПАРСИНГ SSE СТРИМА
                // ==========================================
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                const readable = new ReadableStream({
                    async start(controller) {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop() || '';
                                
                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (trimmedLine.startsWith('data: ')) {
                                        const jsonStr = trimmedLine.slice(6).trim();
                                        if (jsonStr === '[DONE]') continue;
                                        
                                        try {
                                            const data = JSON.parse(jsonStr);
                                            const content = data.choices?.[0]?.delta?.content;
                                            if (content) {
                                                controller.enqueue(new TextEncoder().encode(content));
                                            }
                                        } catch (e) {
                                            // Игнорируем
                                        }
                                    }
                                }
                            }
                            controller.close();
                        } catch (err) {
                            console.error('❌ Ошибка в стриме:', err);
                            controller.error(err);
                        }
                    }
                });

                return new Response(readable, {
                    headers: {
                        'X-Accel-Buffering': 'no',
                        'Cache-Control': 'no-cache, no-transform',
                        'Content-Type': 'text/plain; charset=utf-8',
                        ...corsHeaders
                    }
                });

            } catch (err) {
                // НЕ ВЫВОДИМ ПОЛНЫЙ STACK, ТОЛЬКО СООБЩЕНИЕ
                console.error(`Сбой запроса с ключом ROUTER_KEY${k}:`, err.message);
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
        console.error('Критическое исключение:', err.message);
        return new Response(JSON.stringify({ error: `Критическое исключение сервера: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
}
