import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { createClient } from '@supabase/supabase-js';

//export const config = { runtime: 'edge' };

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
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('set_app_user_id', { uid: userId });

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');
    if (!chatId) throw new Error('Missing chat id');

    // Получаем чат, проверяя принадлежность пользователю
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();
    if (chatError || !chat) throw new Error('Chat not found or access denied');

    // Получаем сообщения чата (последние 500)
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (messagesError) throw messagesError;

    return new Response(JSON.stringify({ success: true, chat, messages }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
