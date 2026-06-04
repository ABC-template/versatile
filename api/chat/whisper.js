// api/chat/whisper.js
export const config = { runtime: 'edge' };

// Быстрая конвертация бинарного потока в чистую Base64-строку
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

// Извлечение всех доступных ключей из переменных окружения Vercel
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
    if (request.method === 'OPTIONS') {
        return new Response('OK', { status: 200 });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405, headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        const arrayBuffer = await request.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return new Response(JSON.stringify({ error: 'Аудиоданные пустые.' }), { 
                status: 400, headers: { 'Content-Type': 'application/json' } 
            });
        }

        const base64Audio = bufferToBase64(arrayBuffer);

        // ИСПРАВЛЕНО: Строгое соответствие спецификации OpenRouter Multimodal Audio Input
        const requestBody = {
            model: 'openai/whisper-large-v3-turbo', 
            input_audio: {
                data: base64Audio,
                format: 'wav' // Фиксируем wav для 100% стабильности распознавания на сервере
            }
        };

        const keysPool = getRotatedKeysPool();
        if (keysPool.length === 0) {
            return new Response(JSON.stringify({ error: 'Серверные API ключи ROUTER_KEY не настроены в Vercel.' }), { 
                status: 500, headers: { 'Content-Type': 'application/json' } 
            });
        }

        let lastError = null;

        for (let k = 0; k < keysPool.length; k++) {
            const currentKey = keysPool[k];

            try {
                // Ссылка пишется слитно, без пробелов внутри fetch
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
                        'Cache-Control': 'no-store'
                    } 
                });

            } catch (err) {
                console.error(`Сбой расшифровки Whisper с ключом ROUTER_KEY${k}:`, err.message);
                lastError = err;
                continue; // Failover: тихо переключаемся на следующий ключ ротации
            }
        }

        return new Response(JSON.stringify({ 
            error: `Модуль аудио перегружен. Детали ошибки: ${lastError?.message || 'Все ключи пула отклонены'}` 
        }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Edge Runtime Audio Exception: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
