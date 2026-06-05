// api/check-sub.js

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    // 1. Создаем базовые CORS заголовки
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Разрешает запросы из Telegram Web App
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 2. Обработка Preflight-запросов браузера (OPTIONS)
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Проверка наличия userId
    if (!userId) {
        return new Response(JSON.stringify({ error: "Параметр userId отсутствует в запросе." }), {
            status: 400, headers: corsHeaders
        });
    }

    const token = process.env.BOT_TOKEN?.trim();
    const channel = process.env.CHANNEL_ID?.trim();

    if (!token || !channel) {
        return new Response(JSON.stringify({ error: "Критические переменные BOT_TOKEN или CHANNEL_ID не настроены в Vercel." }), {
            status: 500, headers: corsHeaders
        });
    }

    const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${channel}&user_id=${userId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            return new Response(JSON.stringify({ isMember: false, error: data.description }), {
                status: 200, headers: corsHeaders
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
            status: 200, headers: corsHeaders
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
            status: 500, headers: corsHeaders
        });
    }
}
