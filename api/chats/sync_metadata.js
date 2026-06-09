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
    const userId = 1541531808; // временно для теста
    
// const supabaseUrl = process.env.SUPABASE_URL?.trim();
// const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
const supabaseUrl = 'https://brkkgdetcdcysxzjhput.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya2tnZGV0Y2RjeXN4empocHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODI2OTEsImV4cCI6MjA5NjE1ODY5MX0.LWzFBpO-K4-pW7VYP4kjU0fks6-kssDTFlL5pRG3LwY';
    
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    
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
    
    const canSyncUrl = `${supabaseUrl}/rest/v1/rpc/can_sync`;
    const canSyncRes = await fetch(canSyncUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: userId })
    });
    
    const canSync = await canSyncRes.json();
    if (!canSync) {
      return new Response(JSON.stringify({ syncEnabled: false, message: 'Sync not allowed' }), { status: 200, headers: corsHeaders });
    }
    
    const chats = await supabaseFetch(`chats?user_id=eq.${userId}&order=updated_at.desc&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at`);
    const favorites = await supabaseFetch(`messages?is_favorite=eq.true&select=id,chat_id,text`);
    const favoritesShort = favorites.map(m => ({ msg_id: m.id, chat_id: m.chat_id, text_preview: m.text.substring(0,100) }));
    
    return new Response(JSON.stringify({ syncEnabled: true, chats, favorites: favoritesShort }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
