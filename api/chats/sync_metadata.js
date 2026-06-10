// api/chats/sync-metadata.js
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

    // Проверяем право на синхронизацию
    const { data: canSyncData } = await supabase.rpc('can_sync', { uid: userId });
    if (!canSyncData) {
      return new Response(JSON.stringify({ syncEnabled: false, message: 'Sync not allowed' }), { status: 200, headers: corsHeaders });
    }

    // Получаем список чатов с минимальной информацией
    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, topic_id, title, max_context, user_renamed, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    // Получаем избранные сообщения (кратко)
    let favorites = [];
    const { data: favMessages, error: favError } = await supabase
      .from('messages')
      .select('id, chat_id, text, is_favorite, updated_at')
      .eq('is_favorite', true)
      .in('chat_id', chats.map(c => c.id));
    if (!favError && favMessages) {
      favorites = favMessages.map(m => ({ msg_id: m.id, chat_id: m.chat_id, text_preview: m.text.substring(0, 100) }));
    }

    return new Response(JSON.stringify({
      syncEnabled: true,
      chats,
      favorites
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
