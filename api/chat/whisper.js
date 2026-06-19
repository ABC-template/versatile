import { validateTelegramInitData } from '../_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

// ==========================================
// ДОБАВЛЕНО: ОГРАНИЧЕНИЕ РАЗМЕРА АУДИО
// ==========================================
const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function bufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    
    const chunk = 65535;
    for (let i = 0; i < len; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    
    return btoa(binary);
}

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

export default async function handler(request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Audio-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
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

        // ==========================================
        // ДОБАВЛЕНО: ПРОВЕРКА USER_ID
        // ==========================================
        const userId = user.id;
        if (!Number.isInteger(userId) || userId <= 0) {
            return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const arrayBuffer = await request.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return new Response(JSON.stringify({ error: 'Аудиоданные пустые.' }), { 
                status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        // ==========================================
        // ДОБАВЛЕНО: ПРОВЕРКА РАЗМЕРА АУДИО
        // ==========================================
        if (arrayBuffer.byteLength > MAX_AUDIO_SIZE_BYTES) {
            const sizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(1);
            return new Response(JSON.stringify({ 
                error: `Аудиофайл слишком большой (${sizeMB}MB). Максимум 5MB.` 
            }), { 
                status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        const base64Audio = bufferToBase64(arrayBuffer);

        const requestBody = {
            model: 'openai/whisper-large-v3-turbo', 
            input_audio: {
                data: base64Audio,
                format: 'wav'
            }
        };

        const keysPool = getRotatedKeysPool();
        if (keysPool.length === 0) {
            return new Response(JSON.stringify({ error: 'Серверные API ключи ROUTER_KEY не настроены в Vercel.' }), { 
                status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        let lastError = null;

        for (let k = 0; k < keysPool.length; k++) {
            const currentKey = keysPool[k];

            try {
                const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Telegram Mini App Versatile AI STT'
                    },
                    body: JSON.stringify(requestBody)
                });

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    const htmlErrorText = await response.text();
                    throw new Error(`Сервер OpenRouter вернул HTML ошибку: ${htmlErrorText.substring(0, 80)}`);
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error?.message || JSON.stringify(data.error) || response.statusText);
                }

                return new Response(JSON.stringify({ text: data.text || "" }), { 
                    status: 200, 
                    headers: { 
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store',
                        ...corsHeaders
                    } 
                });

            } catch (err) {
                console.error(`Сбой расшифровки Whisper с ключом ROUTER_KEY${k}:`, err.message);
                lastError = err;
                continue;
            }
        }

        return new Response(JSON.stringify({ 
            error: `Модуль аудио перегружен. Детали: ${lastError?.message || 'Все ключи пула отклонены'}` 
        }), { 
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });

    } catch (err) {
        console.error("Edge Runtime Audio Exception:", err.message);
        return new Response(JSON.stringify({ error: `Edge Runtime Audio Exception: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
}
