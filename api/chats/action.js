// api/chats/action.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const initData = request.headers.get('x-telegram-init-data');
    if (!initData) throw new Error('Missing init data');
    
    const botToken = process.env.BOT_TOKEN?.trim();
    if (!botToken) throw new Error('Bot token not configured');
    
    // Исправлено: добавлен await для стабильной валидации
    const user = await validateTelegramInitData(initData, botToken);
    if (!user) throw new Error('Invalid init data');
    
    const userId = user.id; 
    
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    
    const body = await request.json();
    const { action, chatId, message, messageId, newTitle, isFavorite, maxContext, chat, firstMessage } = body;
    
    async function supabaseFetch(path, options = {}) {
      const url = `${supabaseUrl}/rest/v1/${path}`;
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      };
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error ${res.status}: ${text}`);
      }
      return res.json();
    }
    
    // Проверяем существование чата и владение им для всех действий кроме создания нового чата и полного удаления чата
    if (chatId && action !== 'new_chat' && action !== 'delete_chat') {
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || chatCheck.length === 0) throw new Error('Chat not found or access denied');
    }
    
    // НАЧАЛО НОВОГО ФУНКЦИОНАЛА: Удаление чата
    if (action === 'delete_chat') {
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || chatCheck.length === 0) throw new Error('Chat not found or access denied');

      // Физическое удаление чата. Благодаря ON DELETE CASCADE в Supabase,
      // сообщения и избранное этого чата сотрутся автоматически.
      await supabaseFetch(`chats?id=eq.${chatId}`, { method: 'DELETE' });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    // КОНЕЦ НОВОГО ФУНКЦИОНАЛА
    
    if (action === 'new_message') {
      await supabaseFetch('messages', {
        method: 'POST',
        body: JSON.stringify({
          id: message.id,
          chat_id: chatId,
          msg_type: message.type,
          text: message.text,
          is_favorite: message.isFavorite || false,
        })
      });
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'delete_message') {
      await supabaseFetch(`messages?id=eq.${messageId}&chat_id=eq.${chatId}`, { method: 'DELETE' });
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'rename_chat') {
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle, user_renamed: true })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'favorite_message') {
      await supabaseFetch(`messages?id=eq.${messageId}&chat_id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: isFavorite })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'update_context') {
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ max_context: maxContext })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'new_chat') {
      await supabaseFetch('chats', {
        method: 'POST',
        body: JSON.stringify({
          id: chat.id,
          user_id: userId,
          topic_id: chat.topic_id,
          title: chat.title,
          max_context: chat.max_context,
          user_renamed: chat.user_renamed,
        })
      });
      await supabaseFetch('messages', {
        method: 'POST',
        body: JSON.stringify({
          id: firstMessage.id,
          chat_id: chat.id,
          msg_type: firstMessage.type,
          text: firstMessage.text,
          is_favorite: firstMessage.is_favorite,
        })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
    }
