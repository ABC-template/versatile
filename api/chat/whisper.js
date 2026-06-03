// api/chat/whisper.js
export const config = { runtime: 'edge' };

// Безопасная и быстрая конвертация ArrayBuffer в Base64 на базе Web API
function bufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    
    // Шаг в 65535 байт предотвращает переполнение стека вызовов (Maximum call stack size exceeded)
    const chunk = 65535;
    for (let i = 0; i < len; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    
    return btoa(binary);
}

export default async function handler(request) {
    // Edge-функции обрабатывают preflight-запросы CORS (если они есть)
    if (request.method === 'OPTIONS') {
        return new Response('OK', { status: 200 });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405, headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        // Читаем бинарный поток аудио напрямую из тела запроса
        const arrayBuffer = await request.arrayBuffer();
        
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return new Response(JSON.stringify({ error: 'Аудиоданные пустые.' }), { 
                status: 400, headers: { 'Content-Type': 'application/json' } 
            });
        }

        const finalKey = process.env.OPENAI_KEY?.trim() || process.env.XAI_KEY?.trim();
        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'API ключ не настроен в Vercel.' }), { 
                status: 500, headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Читаем MIME-тип, присланный с фронтенда (по умолчанию ставим webm)
        const clientAudioType = request.headers.get('X-Audio-Type') || 'audio/webm';
        
        // Извлекаем чистое расширение файла для OpenRouter (webm или mp4)
        let audioFormat = 'webm';
        if (clientAudioType.includes('mp4') || clientAudioType.includes('m4a')) {
            audioFormat = 'mp4';
        } else if (clientAudioType.includes('wav')) {
            audioFormat = 'wav';
        }

        // Применяем оптимизированный веб-стандарт конвертации
        const base64Audio = bufferToBase64(arrayBuffer);

        // Формируем JSON-запрос для OpenRouter с динамическим форматом
        const requestBody = {
            model: 'openai/whisper-large-v3-turbo', 
            input_audio: {
                data: base64Audio,
                format: audioFormat // Теперь формат совпадает с записью устройства!
            }
        };


        const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${finalKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://vercel.com',
                'X-Title': 'Telegram Mini App Bot'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `OpenRouter STT Error: ${data.error?.message || response.statusText}` }), { 
                status: response.status, headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Возвращаем распознанный текст клиенту
        return new Response(JSON.stringify({ text: data.text || "" }), { 
            status: 200, 
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store' // Запрещаем кэширование голосовых запросов
            } 
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Edge Runtime Exception: ${err.message}` }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
