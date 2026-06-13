// api/check-sub.js 
import { validateTelegramInitData } from './_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const initData = req.headers.get('x-telegram-init-data');
    if (!initData) return jsonResponse({ error: "Missing init data" }, 401, corsHeaders);

    const botToken = process.env.BOT_TOKEN?.trim();
    if (!botToken) return jsonResponse({ error: "Bot token not configured" }, 500, corsHeaders);

    const user = await validateTelegramInitData(initData, botToken);
    if (!user || !user.id) return jsonResponse({ error: "Invalid init data" }, 401, corsHeaders);
    const userId = user.id;

    const channel = process.env.CHANNEL_ID?.trim();
    if (!channel) return jsonResponse({ error: "Channel not configured" }, 500, corsHeaders);

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

    let dbUser = null;
    if (supabaseUrl && supabaseKey) {
      // Устанавливаем контекст пользователя для RLS
      await fetch(`${supabaseUrl}/rest/v1/rpc/set_app_user_id`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
      });

      // 🆕 ПРОВЕРЯЕМ И СОЗДАЁМ ПОЛЬЗОВАТЕЛЯ
      const userRes = await fetch(`${supabaseUrl}/rest/v1/users?telegram_id=eq.${userId}&select=telegram_id,role,premium_until`, {
        method: 'GET',
        headers: { 
          'apikey': supabaseKey, 
          'Authorization': `Bearer ${supabaseKey}` 
        }
      });
      
      if (userRes.ok) {
        const users = await userRes.json();
        dbUser = users[0] || null;
        
        // Если пользователь не существует — создаём
        if (!dbUser) {
          console.log(`🆕 Создаём нового пользователя: ${userId}`);
          
          await fetch(`${supabaseUrl}/rest/v1/users`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              telegram_id: userId,
              username: user.username || null,
              role: 'trial',
              user_lang: user.language_code || 'ru',
              created_at: new Date().toISOString()
            })
          });
          
          console.log(`✅ Пользователь ${userId} создан`);
          dbUser = { role: 'trial' };
        } else {
          console.log(`👤 Пользователь ${userId} уже существует`);
        }
      }
    }

    let role = "guest";
    let dailyLimit = 0;
    let syncEnabled = false;

    if (dbUser && (dbUser.role === 'admin' || dbUser.role === 'creator')) {
      role = dbUser.role;
      dailyLimit = 9999;
      syncEnabled = true;
    } else if (dbUser && dbUser.role === 'premium' && new Date(dbUser.premium_until) > new Date()) {
      role = 'premium';
      dailyLimit = 100;
      syncEnabled = true;
    } else {
      const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channel}&user_id=${userId}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.ok) {
        const status = data.result.status;
        const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
        if (['administrator', 'creator'].includes(status)) {
          role = "admin"; dailyLimit = 9999; syncEnabled = true;
        } else if (isMember) {
          role = "trial"; dailyLimit = 5; syncEnabled = false;
        }
      }
    }

    return jsonResponse({
      isMember: role !== 'guest',
      role,
      dailyLimit,
      syncEnabled,
      serverModels: { gemini: true, deepseek: true, gpt: true, claude: true, grok: true }
    }, 200, corsHeaders);

  } catch (err) {
    console.error("Check-sub error:", err);
    return jsonResponse({ error: err.message }, 500, corsHeaders);
  }
}
