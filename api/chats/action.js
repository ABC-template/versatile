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
    
    // Обработчик для batch_messages (массовая отправка сообщений)
if (action === 'batch_messages') {
  const { chatId, topicId, chatTitle, maxContext, userRenamed, messages } = body;
  
  // Проверяем существование чата (и создаем если нет)
  let chatExists = false;
  try {
    const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
    chatExists = chatCheck && chatCheck.length > 0;
  } catch (err) {
    // Игнорируем
  }
  
  if (!chatExists) {
    const canSync = await canUserSync();
    if (!canSync) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Синхронизация недоступна',
        synced: false 
      }), { status: 403, headers: corsHeaders });
    }
    
    await supabaseFetch('chats', {
      method: 'POST',
      body: JSON.stringify({
        id: chatId,
        user_id: userId,
        topic_id: topicId || 'fast',
        title: chatTitle || 'Новый чат',
        max_context: maxContext || 15,
        user_renamed: userRenamed || false,
      })
    });
  }
  
  // Сохраняем все сообщения
  for (const msg of messages) {
    await supabaseFetch('messages', {
      method: 'POST',
      body: JSON.stringify({
        id: msg.id,
        chat_id: chatId,
        msg_type: msg.type,
        text: msg.text,
        is_favorite: msg.isFavorite || false,
      })
    });
  }
  
  // Обновляем updated_at чата
  await supabaseFetch(`chats?id=eq.${chatId}`, {
    method: 'PATCH',
    body: JSON.stringify({ updated_at: new Date().toISOString() })
  });
  
  return new Response(JSON.stringify({ success: true, synced: true }), { status: 200, headers: corsHeaders });
}
    
    // Вспомогательная функция для проверки прав пользователя на синхронизацию
    async function canUserSync() {
      try {
        const userCheck = await supabaseFetch(`users?telegram_id=eq.${userId}&select=role,premium_until`);
        if (!userCheck || userCheck.length === 0) return false;
        
        const userData = userCheck[0];
        const isPro = ['creator', 'admin', 'premium'].includes(userData.role);
        const hasValidPremium = userData.premium_until && new Date(userData.premium_until) > new Date();
        
        return isPro || hasValidPremium;
      } catch (err) {
        console.error('Ошибка проверки прав синхронизации:', err);
        return false;
      }
    }
    
    // НАЧАЛО НОВОГО ФУНКЦИОНАЛА: Удаление чата
    if (action === 'delete_chat') {
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || chatCheck.length === 0) throw new Error('Chat not found or access denied');

      await supabaseFetch(`chats?id=eq.${chatId}`, { method: 'DELETE' });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ОБНОВЛЕННЫЙ ОБРАБОТЧИК new_message с авто-созданием чата
    if (action === 'new_message') {
      // Шаг 1: Проверяем существование чата в БД
      let chatExists = false;
      let existingChat = null;
      
      try {
        const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id,topic_id,title,max_context,user_renamed`);
        chatExists = chatCheck && chatCheck.length > 0;
        if (chatExists) existingChat = chatCheck[0];
      } catch (err) {
        console.error('Ошибка проверки чата:', err);
        // Не падаем, пробуем создать чат дальше
      }
      
      // Шаг 2: Если чата нет, проверяем права и создаем
      if (!chatExists) {
        const canSync = await canUserSync();
        
        if (!canSync) {
          // Пользователь не имеет права на синхронизацию
          // Возвращаем 403, НО не падаем — сообщение уже сохранено локально у клиента
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Синхронизация недоступна для вашего тарифного плана',
            synced: false 
          }), { status: 403, headers: corsHeaders });
        }
        
        // Создаем чат на лету с данными из запроса или дефолтными
        const chatTopic = body.topicId || 'fast';
        const chatTitle = body.chatTitle || `Чат в разделе ${chatTopic}`;
        const chatMaxContext = body.maxContext || 15;
        const chatUserRenamed = body.userRenamed || false;
        
        console.log(`Создаем чат ${chatId} для пользователя ${userId} с темой ${chatTopic}`);
        
        try {
          await supabaseFetch('chats', {
            method: 'POST',
            body: JSON.stringify({
              id: chatId,
              user_id: userId,
              topic_id: chatTopic,
              title: chatTitle,
              max_context: chatMaxContext,
              user_renamed: chatUserRenamed,
            })
          });
          chatExists = true;
        } catch (createErr) {
          console.error('Ошибка создания чата:', createErr);
          // Возвращаем 200, но с флагом synced: false
          // Сообщение уже сохранено локально, клиент повторит попытку позже
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Не удалось создать чат в облаке',
            synced: false 
          }), { status: 200, headers: corsHeaders });
        }
      }
      
      // Шаг 3: Сохраняем сообщение (чат теперь точно существует или не понадобился)
      if (chatExists) {
        try {
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
          
          // Обновляем updated_at чата
          await supabaseFetch(`chats?id=eq.${chatId}`, {
            method: 'PATCH',
            body: JSON.stringify({ updated_at: new Date().toISOString() })
          });
          
          return new Response(JSON.stringify({ success: true, synced: true }), { status: 200, headers: corsHeaders });
        } catch (msgErr) {
          console.error('Ошибка сохранения сообщения:', msgErr);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Сообщение не сохранено в облаке',
            synced: false 
          }), { status: 200, headers: corsHeaders });
        }
      }
      
      // Fallback: если что-то пошло не так
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Неизвестная ошибка синхронизации',
        synced: false 
      }), { status: 200, headers: corsHeaders });
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
      // Проверяем права перед созданием чата
      const canSync = await canUserSync();
      if (!canSync) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Создание облачных чатов доступно только PRO-пользователям' 
        }), { status: 403, headers: corsHeaders });
      }
      
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
