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
    const user = await validateTelegramInitData(initData, botToken);
    if (!user) throw new Error('Invalid init data');
    const userId = user.id;
    
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
    
    await fetch(`${supabaseUrl}/rest/v1/rpc/set_app_user_id`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: userId })
    });
    
    const body = await request.json();
    const { action, chatId, message, messageId, newTitle, isFavorite, maxContext, chat, firstMessage } = body;
    
    if (chatId && action !== 'new_chat') {
      const checkRes = await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`, {
        method: 'GET',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const chatCheck = checkRes.ok ? await checkRes.json() : [];
      if (!chatCheck || chatCheck.length === 0) throw new Error('Chat not found or access denied');
    }
    
    if (action === 'new_message') {
      await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: message.id,
          chat_id: chatId,
          msg_type: message.type,
          text: message.text,
          is_favorite: message.isFavorite || false,
        })
      });
      
      await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chatId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'delete_message') {
      await fetch(`${supabaseUrl}/rest/v1/messages?id=eq.${messageId}&chat_id=eq.${chatId}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'rename_chat') {
      await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chatId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, user_renamed: true })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'favorite_message') {
      await fetch(`${supabaseUrl}/rest/v1/messages?id=eq.${messageId}&chat_id=eq.${chatId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: isFavorite })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'update_context') {
      await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chatId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_context: maxContext })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    if (action === 'new_chat') {
      await fetch(`${supabaseUrl}/rest/v1/chats`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chat.id,
          user_id: userId,
          topic_id: chat.topic_id,
          title: chat.title,
          max_context: chat.max_context,
          user_renamed: chat.user_renamed,
        })
      });
      
      await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: firstMessage.id,
          chat_id: chat.id,
          msg_type: firstMessage.type,
          text: firstMessage.text,
          is_favorite: firstMessage.firstMessage?.is_favorite || false,
        })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
