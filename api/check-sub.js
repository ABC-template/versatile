import { validateTelegramInitData } from './_lib/telegram_auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const initData = req.headers.get('x-telegram-init-data');
  if (!initData) {
    return new Response(JSON.stringify({ error: "Missing init data" }), { status: 401, headers: corsHeaders });
  }
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    return new Response(JSON.stringify({ error: "Bot token not configured" }), { status: 500, headers: corsHeaders });
  }
  // Временно (для проверки синхронизации)
const user = validateTelegramInitData(initData, botToken);
// ВРЕМЕННО: пропускаем проверку и создаём фейкового пользователя
const userId = user?.id || 1541531808;  // ваш тестовый ID

// Для теста – игнорируем результат валидации
// if (!user || !user.id) {
//     return new Response(JSON.stringify({ error: "Invalid init data" }), { status: 401, headers: corsHeaders });
// }

// const userId = user.id; // старая строка, закомментировать

  const channel = '@bdicta';
  if (!channel) {
    return new Response(JSON.stringify({ error: "Channel not configured" }), { status: 500, headers: corsHeaders });
  }

// const supabaseUrl = process.env.SUPABASE_URL?.trim();
// const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
const supabaseUrl = 'https://brkkgdetcdcysxzjhput.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya2tnZGV0Y2RjeXN4empocHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODI2OTEsImV4cCI6MjA5NjE1ODY5MX0.LWzFBpO-K4-pW7VYP4kjU0fks6-kssDTFlL5pRG3LwY';
  
  let dbUser = null;
  let canSync = false;

  if (supabaseUrl && supabaseKey) {
    // Устанавливаем контекст RLS для пользователя
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/set_app_user_id`;
    await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: userId })
    });

    // Получаем данные пользователя
    const userUrl = `${supabaseUrl}/rest/v1/users?telegram_id=eq.${userId}&select=role,premium_until`;
    const userRes = await fetch(userUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });
    if (userRes.ok) {
      const users = await userRes.json();
      if (users && users.length) dbUser = users[0];
    }

    // Проверяем право на синхронизацию через RPC can_sync
    const canSyncUrl = `${supabaseUrl}/rest/v1/rpc/can_sync`;
    const canSyncRes = await fetch(canSyncUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: userId })
    });
    if (canSyncRes.ok) {
      const result = await canSyncRes.json();
      canSync = !!result;
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
    // Проверка через Telegram API
    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channel}&user_id=${userId}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.ok) {
        const status = data.result.status;
        const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
        const isAdmin = ['administrator', 'creator'].includes(status);
        if (isAdmin) {
          role = "admin";
          dailyLimit = 9999;
          syncEnabled = true;
        } else if (isMember) {
          role = "trial";
          dailyLimit = 5;
          syncEnabled = false;
        }
      }
    } catch (err) {
      console.error("Ошибка проверки канала:", err);
    }
  }

  // Если определили синхронизацию через can_sync, но не через роль – используем canSync
  if (!syncEnabled && canSync) {
    syncEnabled = true;
  }

  const resBody = {
    isMember: role !== 'guest',
    role: role,
    dailyLimit: dailyLimit,
    syncEnabled: syncEnabled,
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
}
