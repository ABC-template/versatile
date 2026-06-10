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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uid: userId })
    });

    const canSyncRes = await fetch(`${supabaseUrl}/rest/v1/rpc/can_sync`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uid: userId })
    });
    const canSyncData = canSyncRes.ok ? await canSyncRes.json() : false;
    if (!canSyncData) {
      return new Response(JSON.stringify({ syncEnabled: false, message: 'Sync not allowed' }), { status: 200, headers: corsHeaders });
    }

    const chatsRes = await fetch(`${supabaseUrl}/rest/v1/chats?user_id=eq.${userId}&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at&order=updated_at.desc`, {
      method: 'GET',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const chats = chatsRes.ok ? await chatsRes.json() : [];

    let favorites = [];
    if (chats.length > 0) {
      const chatIdsQuery = chats.map(c => c.id).join(',');
      const favRes = await fetch(`${supabaseUrl}/rest/v1/messages?is_favorite=eq.true&chat_id=in.(${chatIdsQuery})&select=id,chat_id,text,is_favorite,updated_at`, {
        method: 'GET',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      if (favRes.ok) {
        const favMessages = await favRes.json();
        favorites = favMessages.map(m => ({
          msg_id: m.id,
          chat_id: m.chat_id,
          text_preview: m.text.substring(0, 100)
        }));
      }
    }

    return new Response(JSON.stringify({ syncEnabled: true, chats, favorites }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
