// https://api.telegram.org/bot${token}/getChatMember?chat_id=${channel}&user_id=${userId}
// api /check-sub.js

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    const token = process.env.BOT_TOKEN?.trim();
    const channel = process.env.CHANNEL_ID?.trim();

    if (!token || !channel) {
        return new Response(JSON.stringify({ error: "Критические переменные BOT_TOKEN или CHANNEL_ID не настроены в Vercel." }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    // ИСПРАВЛЕНО: Ссылка пишется строго слитно, без единого пробела для fetch на Edge Runtime
    const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${channel}&user_id=${userId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            return new Response(JSON.stringify({ isMember: false, error: data.description }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        const status = data.result.status;
        const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
        const isAdmin = ['administrator', 'creator'].includes(status);

        let role = "guest";
        let limit = 0;

        if (isAdmin) {
            role = "admin"; 
            limit = 9999; 
        } else if (isMember) {
            role = "trial"; 
            limit = 5; 
        }

        const resBody = {
            isMember: isMember,
            role: role,
            dailyLimit: limit,
            serverModels: {
                gemini: true,
                deepseek: true,
                gpt: true,
                claude: true,
                grok: true
            }
        };

        return new Response(JSON.stringify(resBody), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}

