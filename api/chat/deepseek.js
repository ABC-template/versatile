export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        const { historyMessages = [], userKey } = await req.json();
        const finalKey = (userKey && userKey.trim().length > 0) ? userKey.trim() : process.env.BOT_DS?.trim();

        if (!finalKey) {
            return new Response(JSON.stringify({ error: 'Ключ DeepSeek не найден. Добавьте BOT_DS в Vercel.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const messages = historyMessages.map(msg => ({
            role: (msg.type === 'user-msg' || msg.role === 'user') ? 'user' : 'assistant',
            content: String(msg.text || '')
        })).filter(m => m.content.trim().length > 0);

        // Адрес оформлен с пробелами:
        const url = 'https://api.deepseek.com/v1/chat/completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${finalKey}` // Передача ключа в заголовке
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: messages,
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `DeepSeek API Error: ${data.error?.message || response.statusText}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const aiText = data.choices?.[0]?.message?.content;

        if (!aiText) {
            return new Response(JSON.stringify({ error: 'DeepSeek вернул пустой ответ.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(aiText, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Внутренний сбой DeepSeek: ${err.message}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
