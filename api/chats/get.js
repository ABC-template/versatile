// api/chats/get.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

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
    
    const user = await validateTelegramInitData(initData, botToken);
    if (!user) throw new Error('Invalid init data');
    const userId = user.id;

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');
    if (!chatId) throw new Error('Missing chat id');

    // Устанавливаем RLS контекст в базе данных
    try {
      await fetch(`${supabaseUrl}/rest/v1/rpc/set_app_user_id`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
      });
    } catch (err) {
      console.error('RPC set_app_user_id error:', err);
    }

    // Запрашиваем конкретный чат (проверяя владельца через сессию)
    const chatRes = await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${userId}&select=*`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/vnd.pgrst.object+json'
      }
    });
    
    if (!chatRes.ok) throw new Error('Chat not found or access denied');
    const chat = await chatRes.json();

    // Подгружаем историю сообщений чата с сортировкой по created_at (важно для последовательности!)
    const msgRes = await fetch(`${supabaseUrl}/rest/v1/messages?chat_id=eq.${chatId}&order=created_at.asc&limit=500`, {
      method: 'GET',
      headers: { 
        'apikey': supabaseKey, 
        'Authorization': `Bearer ${supabaseKey}` 
      }
    });
    
    const messages = msgRes.ok ? await msgRes.json() : [];

    return new Response(JSON.stringify({ success: true, chat, messages }), { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (err) {
    console.error('Get chat error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
