import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { createClient } from '@supabase/supabase-js';

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
    const user = validateTelegramInitData(initData, botToken);
    if (!user) throw new Error('Invalid init data');
    const userId = user.id;

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('set_app_user_id', { uid: userId });

    const body = await request.json();
    const { action, chatId, message, messageId, newTitle, isFavorite, maxContext } = body;

    // Проверяем, что чат принадлежит пользователю
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();
    if (chatError || !chat) throw new Error('Chat not found or access denied');
    
    if (action === 'new_chat') {
  const { chat, firstMessage } = body;
  // Вставляем чат
  const { error: chatInsertError } = await supabase
    .from('chats')
    .insert({
      id: chat.id,
      user_id: userId,
      topic_id: chat.topic_id,
      title: chat.title,
      max_context: chat.max_context,
      user_renamed: chat.user_renamed,
    });
  if (chatInsertError) throw chatInsertError;
  // Вставляем первое сообщение
  const { error: msgInsertError } = await supabase
    .from('messages')
    .insert({
      id: firstMessage.id,
      chat_id: chat.id,
      msg_type: firstMessage.type,
      text: firstMessage.text,
      is_favorite: firstMessage.is_favorite,
    });
  if (msgInsertError) throw msgInsertError;
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (action === 'new_message') {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id: message.id,
          chat_id: chatId,
          msg_type: message.type,
          text: message.text,
          is_favorite: message.isFavorite || false,
        });
      if (error) throw error;
      // Обновляем updated_at чата
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (action === 'delete_message') {
      const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('chat_id', chatId);
      if (error) throw error;
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (action === 'rename_chat') {
      const { error } = await supabase.from('chats').update({ title: newTitle, user_renamed: true }).eq('id', chatId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (action === 'favorite_message') {
      const { error } = await supabase.from('messages').update({ is_favorite: isFavorite }).eq('id', messageId).eq('chat_id', chatId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (action === 'update_context') {
      const { error } = await supabase.from('chats').update({ max_context: maxContext }).eq('id', chatId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
