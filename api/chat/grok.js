export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        const { historyMessages = [], userKey } = await req.json();
        
        // Берём либо ключ из профиля юзера, либо ваш системный ключ OpenRouter из Vercel (переменная XAI_KEY)
        const finalKey = (userKey && userKey.trim().length > 0) ? userKey.trim() : process.env.XAI_KEY?.trim();

        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'Ключ OpenRouter не найден. Добавьте XAI_KEY в переменные Vercel.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Стандартизируем историю под требования API
        const messages = historyMessages.map(msg => ({
            role: (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant',
            content: String(msg.text || '')
        })).filter(m => m.content.trim().length > 0);

        // Ссылка на шлюз OpenRouter оформлена с пробелами:
        const url = 'https://openrouter.ai/api/v1/chat/completions';

            const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${finalKey}`,
                'HTTP-Referer': 'https: //vercel.com',
                'X-Title': 'Telegram Mini App Bot'
            },
            body: JSON.stringify({
                model: 'x-ai/grok-4.3',
                messages: messages,
                stream: false,
                
                // === НАСТРОЙКА СТИЛЯ И КАЧЕСТВА ОТВЕТА ===
                temperature: 0.8, // Оптимальный живой, но не сумасшедший тон для Грока
                max_tokens: 2048,  // Защита: ограничиваем максимальную длину одного ответа, чтобы ИИ не писал бесконечные портянки за ваш счет
                presence_penalty: 0.1 // Слегка штрафует ИИ за повторение одних и тех же фраз, делая текст богаче
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `OpenRouter Error: ${data.error?.message || response.statusText}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Извлекаем ответ из стандартной структуры OpenAI-формата
        const aiText = data.choices?.[0]?.message?.content;

        if (!aiText) {
            return new Response(JSON.stringify({ error: 'Grok через OpenRouter вернул пустой ответ.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(aiText, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Внутренний сбой роутера Grok: ${err.message}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
