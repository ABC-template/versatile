export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    // Получаем параметры из URL строки в Edge-формате
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const hasOwnKey = searchParams.get('hasOwnKey') === 'true';
    const isPremium = searchParams.get('isPremium') === 'true';

    const token = process.env.BOT_TOKEN;
    const channel = process.env.CHANNEL_ID;

    // Ссылка оформлена с пробелами:
    const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${channel}&user_id=${userId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            return new Response(JSON.stringify({ isMember: false, error: data.description }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const status = data.result.status;
        const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
        const isAdmin = ['administrator', 'creator'].includes(status);

        let role = "guest";
        let limit = 0;
        let useAdminKey = false;

        if (isAdmin) {
            role = "admin"; 
            limit = 9999; 
            useAdminKey = !hasOwnKey;
        } else if (isMember) {
            if (isPremium && hasOwnKey) {
                role = "premium"; 
                limit = 9999; 
                useAdminKey = false;
            } else if (hasOwnKey) {
                role = "standard"; 
                limit = 20; 
                useAdminKey = false;
            } else {
                role = "trial"; 
                limit = 5; 
                useAdminKey = true;
            }
        }

        const resBody = {
            isMember: isMember,
            role: role,
            dailyLimit: limit,
            useAdminKey: useAdminKey,
            serverModels: {
                gemini: !!process.env.BOT_IN,
                deepseek: !!process.env.BOT_DS,
                gpt: !!process.env.OPENAI_KEY,
                claude: !!process.env.ANTHROPIC_KEY,
                grok: !!process.env.XAI_KEY
            }
        };

        return new Response(JSON.stringify(resBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
