import { validateTelegramInitData } from '../_lib/telegram_auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const initData = request.headers.get('x-telegram-init-data');
    if (!initData) throw new Error('Missing init data');
    const botToken = process.env.BOT_TOKEN?.trim();
    if (!botToken) throw new Error('Bot token not configured');
    const user = validateTelegramInitData(initData, botToken);
    if (!user) throw new Error('Invalid init data');
    const userId = user.id;

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

    // Установка контекста RLS
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

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');
    if (!chatId) throw new Error('Missing chat id');

    async function supabaseFetch(path) {
      const url = `${supabaseUrl}/rest/v1/${path}`;
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      };
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error ${res.status}: ${text}`);
      }
      return res.json();
    }

    const chats = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}`);
    if (!chats || chats.length === 0) throw new Error('Chat not found or access denied');
    const chat = chats[0];

    const messages = await supabaseFetch(`messages?chat_id=eq.${chatId}&order=created_at.asc&limit=500`);
    return new Response(JSON.stringify({ success: true, chat, messages }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
