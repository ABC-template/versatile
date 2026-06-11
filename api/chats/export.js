// api/chats/export.js
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

    // Шаг 1: Валидация прав на получение облачного архива
    const userCheck = await supabaseFetch(`users?telegram_id=eq.${userId}&select=role,data_deadline`);
    if (!userCheck || userCheck.length === 0) throw new Error('User not found');

    const currentUser = userCheck[0];
    const isPro = ['creator', 'admin', 'premium'].includes(currentUser.role);
    
    let hasGracePeriod = false;
    if (currentUser.data_deadline) {
      const deadline = new Date(currentUser.data_deadline);
      if (deadline > new Date()) {
        hasGracePeriod = true;
      }
    }

    // Если не PRO и 7 дней истекли (или не наступали) — доступ закрыт
    if (!isPro && !hasGracePeriod) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Скачивание облачного архива доступно только PRO-пользователям или в течение 7 дней после окончания подписки.' 
      }), { status: 403, headers: corsHeaders });
    }

    // Шаг 2: Извлечение всех заголовков чатов пользователя
    const chats = await supabaseFetch(`chats?user_id=eq.${userId}&select=*&order=updated_at.desc`);
    
    let compiledArchive = [];

    if (chats.length > 0) {
      // Сборка ID для пакетного запроса сообщений
      const chatIdsQuery = chats.map(c => c.id).join(',');
      
      // Вытягиваем абсолютно все сообщения, привязанные к этим чатам
      const messages = await supabaseFetch(`messages?chat_id=in.(${chatIdsQuery})&order=created_at.asc`);

      // Структурируем финальное дерево данных для экспорта
      compiledArchive = chats.map(chat => {
        return {
          chat_id: chat.id,
          title: chat.title,
          topic_id: chat.topic_id,
          max_context: chat.max_context,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          messages: messages.filter(m => m.chat_id === chat.id).map(m => ({
            id: m.id,
            type: m.msg_type,
            text: m.text,
            is_favorite: m.is_favorite,
            created_at: m.created_at
          }))
        };
      });
    }

    // Шаг 3: Отдаем готовый JSON-файл прямо в поток
    return new Response(JSON.stringify({ 
      success: true, 
      exported_at: new Date().toISOString(),
      user_id: userId,
      archive: compiledArchive 
    }), { 
      status: 200, 
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="versatile_ai_archive_${userId}.json"`
      } 
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
