// api/chats/sync-metadata.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { getSupabaseConfig } from '../_lib/supabase-client.js';

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
    
    // ==========================================
    // ДОБАВЛЕНО: ПРОВЕРКА USER_ID
    // ==========================================
    if (!Number.isInteger(userId) || userId <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const config = getSupabaseConfig();

    // Устанавливаем контекст пользователя для RLS
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

    // Проверяем, может ли пользователь синхронизироваться
    let canSyncData = false;
    try {
      const canSyncRes = await fetch(`${config.url}/rest/v1/rpc/can_sync`, {
        method: 'POST',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
      });
      canSyncData = canSyncRes.ok ? await canSyncRes.json() : false;
    } catch (err) {
      console.error('RPC can_sync error:', err);
    }
    
    if (!canSyncData) {
      return new Response(JSON.stringify({ 
        syncEnabled: false, 
        message: 'Sync not allowed - insufficient privileges',
        chats: [],
        favorites: []
      }), { status: 200, headers: corsHeaders });
    }

    // Запрашиваем чаты с updated_at
    const chatsRes = await fetch(`${config.url}/rest/v1/chats?user_id=eq.${userId}&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at&order=updated_at.desc`, {
      method: 'GET',
      headers: { 
        'apikey': config.key, 
        'Authorization': `Bearer ${config.key}` 
      }
    });
    
    const chats = chatsRes.ok ? await chatsRes.json() : [];

    // Запрашиваем избранные сообщения
    let favorites = [];
    if (chats.length > 0) {
      const chatIdsQuery = chats.map(c => c.id).join(',');
      const favRes = await fetch(`${config.url}/rest/v1/messages?is_favorite=eq.true&chat_id=in.(${chatIdsQuery})&select=id,chat_id,text,is_favorite,updated_at&order=updated_at.desc`, {
        method: 'GET',
        headers: { 
          'apikey': config.key, 
          'Authorization': `Bearer ${config.key}` 
        }
      });
      
      if (favRes.ok) {
        const favMessages = await favRes.json();
        favorites = favMessages.map(m => ({
          msg_id: m.id,
          chat_id: m.chat_id,
          text_preview: m.text.substring(0, 100),
          updated_at: m.updated_at
        }));
      }
    }

    return new Response(JSON.stringify({ 
      syncEnabled: true, 
      chats, 
      favorites 
    }), { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (err) {
    console.error('Sync metadata error:', err.message);
    return new Response(JSON.stringify({ 
      error: err.message,
      syncEnabled: false,
      chats: [],
      favorites: []
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
