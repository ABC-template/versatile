// api/chats/get.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { isValidUUID } from '../_lib/validate-uuid.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';

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
    
    // ==========================================
    // ДОБАВЛЕНО: ПРОВЕРКА USER_ID
    // ==========================================
    const userId = user.id;
    if (!Number.isInteger(userId) || userId <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const config = getSupabaseConfig();

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');
    if (!chatId) throw new Error('Missing chat id');
    
    if (!isValidUUID(chatId)) {
      return new Response(JSON.stringify({ error: 'Invalid chat ID format' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // Устанавливаем RLS контекст
    try {
      await fetch(`${config.url}/rest/v1/rpc/set_app_user_id`, {
        method: 'POST',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
      });
    } catch (err) {
      console.error('RPC set_app_user_id error:', err);
    }

    const chatRes = await fetch(`${config.url}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${userId}&select=*`, {
      method: 'GET',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Accept': 'application/vnd.pgrst.object+json'
      }
    });
    
    if (!chatRes.ok) throw new Error('Chat not found or access denied');
    const chat = await chatRes.json();

    // ==========================================
    // ИСПРАВЛЕНО: ПАГИНАЦИЯ ДЛЯ БОЛЬШИХ ЧАТОВ
    // ==========================================
    let allMessages = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    
    while (hasMore) {
      const msgRes = await fetch(`${config.url}/rest/v1/messages?chat_id=eq.${chatId}&order=created_at.asc&limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: { 
          'apikey': config.key, 
          'Authorization': `Bearer ${config.key}` 
        }
      });
      
      if (msgRes.ok) {
        const batch = await msgRes.json();
        if (batch && batch.length > 0) {
          allMessages = allMessages.concat(batch);
          offset += limit;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return new Response(JSON.stringify({ success: true, chat, messages: allMessages }), { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (err) {
    console.error('Get chat error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
