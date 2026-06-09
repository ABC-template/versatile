import { validateTelegramInitData } from './_lib/telegram-auth.js';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const initData = req.headers.get('x-telegram-init-data');
  if (!initData) {
    return new Response(JSON.stringify({ error: "Missing init data" }), { status: 401, headers: corsHeaders });
  }
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    return new Response(JSON.stringify({ error: "Bot token not configured" }), { status: 500, headers: corsHeaders });
  }
  const user = validateTelegramInitData(initData, botToken);
  if (!user || !user.id) {
    return new Response(JSON.stringify({ error: "Invalid init data" }), { status: 401, headers: corsHeaders });
  }
  const userId = user.id;

  // Далее проверка канала и получение данных из БД
  const channel = process.env.CHANNEL_ID?.trim();
  if (!channel) {
    return new Response(JSON.stringify({ error: "Channel not configured" }), { status: 500, headers: corsHeaders });
  }
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
let dbUser = null;
if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  await supabase.rpc('set_app_user_id', { uid: userId });
  const { data } = await supabase
    .from('users')
    .select('role, premium_until')
    .eq('telegram_id', userId)
    .maybeSingle();
  dbUser = data;
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
