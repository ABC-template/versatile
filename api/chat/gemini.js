export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        const { historyMessages = [], userKey } = await req.json();
        const finalKey = (userKey && userKey.trim().length > 0) ? userKey.trim() : process.env.BOT_IN?.trim();

        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'Ключ Gemini не найден. Добавьте BOT_IN в Vercel.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Маппинг истории под нативный формат Google Gemini API
        const contents = historyMessages.map(msg => ({
            role: (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'model',
            parts: [{ text: String(msg.text || '') }]
        })).filter(c => c.parts[0].text.trim().length > 0);

        // Ссылка оформлена с пробелами:
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${finalKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `Google API Error: ${data.error?.message || response.statusText}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!aiText) {
            return new Response(JSON.stringify({ error: 'Gemini вернул пустой ответ или сработал фильтр контента.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(aiText, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Внутренний сбой Gemini: ${err.message}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
