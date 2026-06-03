export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        const { historyMessages = [], userKey } = await req.json();
        const finalKey = (userKey && userKey.trim().length > 0) ? userKey.trim() : process.env.ANTHROPIC_KEY?.trim();

        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'Ключ OpenRouter не найден. Добавьте ANTHROPIC_KEY в Vercel.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const messages = historyMessages.map(msg => ({
            role: (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant',
            content: String(msg.text || '')
        })).filter(m => m.content.trim().length > 0);

        // Ссылка на шлюз OpenRouter оформлена с пробелами:
        const url = 'https: //openrouter.ai /api /v1 /chat /completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${finalKey}`,
                'HTTP-Referer': 'https: //vercel.com',
                'X-Title': 'Telegram Mini App Bot'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet', // Идентификатор Claude 3.5 Sonnet на OpenRouter
                messages: messages,
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `OpenRouter Claude Error: ${data.error?.message || response.statusText}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Безопасное извлечение без синтаксических ошибок (исправлено)
        const aiText = data.choices?.[0]?.message?.content;

        if (!aiText) {
            return new Response(JSON.stringify({ error: 'Claude через OpenRouter вернул пустой ответ.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(aiText, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Внутренний сбой роутера Claude: ${err.message}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
