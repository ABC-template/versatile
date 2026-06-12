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

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // Безопасное чтение тела запроса
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('Ошибка парсинга JSON:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders
    });
  }

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
    
    const { action, chatId, message, messageId, newTitle, isFavorite, maxContext, chat, firstMessage } = body;
    
    // Улучшенная функция запроса к Supabase с обработкой пустых ответов
    async function supabaseFetch(path, options = {}) {
      const url = `${supabaseUrl}/rest/v1/${path}`;
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': options.method === 'POST' ? 'return=representation' : undefined
      };
      
      // Убираем undefined заголовки
      Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);
      
      const res = await fetch(url, { ...options, headers });
      
      // Для DELETE запросов или пустых ответов
      if (res.status === 204 || res.headers.get('content-length') === '0') {
        return { success: true };
      }
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
      }
      
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        // Для POST запросов возвращаем первый элемент или данные
        if (options.method === 'POST') {
          return Array.isArray(data) ? (data[0] || data) : data;
        }
        return data;
      }
      
      return { success: true };
    }
    
    // Вспомогательная функция для проверки прав пользователя на синхронизацию
    async function canUserSync() {
      try {
        const userCheck = await supabaseFetch(`users?telegram_id=eq.${userId}&select=role,premium_until`);
        if (!userCheck || userCheck.length === 0) return false;
        
        const userData = Array.isArray(userCheck) ? userCheck[0] : userCheck;
        const isPro = ['creator', 'admin', 'premium'].includes(userData.role);
        const hasValidPremium = userData.premium_until && new Date(userData.premium_until) > new Date();
        
        return isPro || hasValidPremium;
      } catch (err) {
        console.error('Ошибка проверки прав синхронизации:', err);
        return false;
      }
    }
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА
    // ==========================================
    if (action === 'delete_chat') {
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        throw new Error('Chat not found or access denied');
      }
      
      await supabaseFetch(`chats?id=eq.${chatId}`, { method: 'DELETE' });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // НОВОЕ СООБЩЕНИЕ (с авто-созданием чата для PRO и UPSERT)
    // ==========================================
    if (action === 'new_message') {
      // Шаг 1: Проверяем существование чата в БД
      let chatExists = false;
      let existingChat = null;
      
      try {
        const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id,topic_id,title,max_context,user_renamed`);
        if (chatCheck && Array.isArray(chatCheck) && chatCheck.length > 0) {
          chatExists = true;
          existingChat = chatCheck[0];
        }
      } catch (err) {
        console.error('Ошибка проверки чата:', err);
      }
      
      // Шаг 2: Если чата нет, проверяем права и создаем
      if (!chatExists) {
        const canSync = await canUserSync();
        
        if (!canSync) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Синхронизация недоступна для вашего тарифного плана',
            synced: false 
          }), { status: 403, headers: corsHeaders });
        }
        
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
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Не удалось создать чат в облаке',
            synced: false 
          }), { status: 200, headers: corsHeaders });
        }
      }
      
      // Шаг 3: Сохраняем сообщение (UPSERT - обновляем или вставляем)
      if (chatExists && message) {
        try {
          // Пробуем обновить существующее сообщение (PATCH)
          const updateResult = await supabaseFetch(`messages?id=eq.${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              chat_id: chatId,
              msg_type: message.type,
              text: message.text,
              is_favorite: message.isFavorite || false,
            })
          });
          
          // Проверяем, обновилось ли что-то
          const noRowsUpdated = !updateResult || 
            (Array.isArray(updateResult) && updateResult.length === 0) ||
            (updateResult.message && updateResult.message.includes('no rows'));
          
          if (noRowsUpdated) {
            // Сообщения нет — вставляем новое
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
            console.log(`✅ Новое сообщение ${message.id} (${message.type}) вставлено`);
          } else {
            console.log(`🔄 Сообщение ${message.id} (${message.type}) обновлено`);
          }
          
          // Обновляем updated_at чата
          await supabaseFetch(`chats?id=eq.${chatId}`, {
            method: 'PATCH',
            body: JSON.stringify({ updated_at: new Date().toISOString() })
          });
          
          return new Response(JSON.stringify({ success: true, synced: true }), { status: 200, headers: corsHeaders });
          
        } catch (msgErr) {
          console.error('Ошибка сохранения сообщения:', msgErr);
          
          // Если ошибка 409 (duplicate key), всё равно считаем успехом
          if (msgErr.message && (msgErr.message.includes('duplicate key') || msgErr.message.includes('409'))) {
            console.log(`⚠️ Сообщение ${message.id} уже существует в БД, считаем синхронизированным`);
            return new Response(JSON.stringify({ success: true, synced: true }), { status: 200, headers: corsHeaders });
          }
          
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Сообщение не сохранено в облаке',
            synced: false 
          }), { status: 200, headers: corsHeaders });
        }
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Неизвестная ошибка синхронизации',
        synced: false 
      }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // МАССОВАЯ ОТПРАВКА СООБЩЕНИЙ (batch)
    // ==========================================
    if (action === 'batch_messages') {
      const { chatId: batchChatId, topicId, chatTitle, maxContext, userRenamed, messages: batchMessages } = body;
      
      if (!batchMessages || !Array.isArray(batchMessages) || batchMessages.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No messages to save' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      // Проверяем существование чата
      let chatExists = false;
      try {
        const chatCheck = await supabaseFetch(`chats?id=eq.${batchChatId}&user_id=eq.${userId}&select=id`);
        chatExists = chatCheck && Array.isArray(chatCheck) && chatCheck.length > 0;
      } catch (err) {
        console.error('Ошибка проверки чата для batch:', err);
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
            id: batchChatId,
            user_id: userId,
            topic_id: topicId || 'fast',
            title: chatTitle || 'Новый чат',
            max_context: maxContext || 15,
            user_renamed: userRenamed || false,
          })
        });
      }
      
      // Сохраняем все сообщения (UPSERT для каждого)
      for (const msg of batchMessages) {
        try {
          // Пробуем обновить
          await supabaseFetch(`messages?id=eq.${msg.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              chat_id: batchChatId,
              msg_type: msg.type,
              text: msg.text,
              is_favorite: msg.isFavorite || false,
            })
          });
        } catch (err) {
          // Если обновление не сработало (нет записи), вставляем
          if (err.message && err.message.includes('no rows')) {
            await supabaseFetch('messages', {
              method: 'POST',
              body: JSON.stringify({
                id: msg.id,
                chat_id: batchChatId,
                msg_type: msg.type,
                text: msg.text,
                is_favorite: msg.isFavorite || false,
              })
            });
          }
        }
      }
      
      // Обновляем updated_at чата
      await supabaseFetch(`chats?id=eq.${batchChatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      
      return new Response(JSON.stringify({ success: true, synced: true, count: batchMessages.length }), { 
        status: 200, 
        headers: corsHeaders 
      });
    }
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================
    if (action === 'delete_message') {
      if (!messageId || !chatId) {
        return new Response(JSON.stringify({ error: 'Missing messageId or chatId' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`messages?id=eq.${messageId}&chat_id=eq.${chatId}`, { method: 'DELETE' });
      
      // Обновляем updated_at чата
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ПЕРЕИМЕНОВАНИЕ ЧАТА
    // ==========================================
    if (action === 'rename_chat') {
      if (!chatId || !newTitle) {
        return new Response(JSON.stringify({ error: 'Missing chatId or newTitle' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle, user_renamed: true })
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ИЗБРАННОЕ СООБЩЕНИЕ
    // ==========================================
    if (action === 'favorite_message') {
      if (!messageId || !chatId || isFavorite === undefined) {
        return new Response(JSON.stringify({ error: 'Missing messageId, chatId or isFavorite' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`messages?id=eq.${messageId}&chat_id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: isFavorite })
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ КОНТЕКСТА (память чата)
    // ==========================================
    if (action === 'update_context') {
      if (!chatId || maxContext === undefined) {
        return new Response(JSON.stringify({ error: 'Missing chatId or maxContext' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ max_context: maxContext })
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // НОВЫЙ ЧАТ (с приветственным сообщением)
    // ==========================================
    if (action === 'new_chat') {
      if (!chat || !firstMessage) {
        return new Response(JSON.stringify({ error: 'Missing chat or firstMessage' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      // Проверяем права перед созданием чата
      const canSync = await canUserSync();
      if (!canSync) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Создание облачных чатов доступно только PRO-пользователям' 
        }), { status: 403, headers: corsHeaders });
      }
      
      // Создаем чат
      await supabaseFetch('chats', {
        method: 'POST',
        body: JSON.stringify({
          id: chat.id,
          user_id: userId,
          topic_id: chat.topic_id,
          title: chat.title,
          max_context: chat.max_context || 15,
          user_renamed: chat.user_renamed || false,
        })
      });
      
      // Сохраняем приветственное сообщение (UPSERT)
      try {
        await supabaseFetch(`messages?id=eq.${firstMessage.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            chat_id: chat.id,
            msg_type: firstMessage.type,
            text: firstMessage.text,
            is_favorite: firstMessage.is_favorite || false,
          })
        });
      } catch (err) {
        await supabaseFetch('messages', {
          method: 'POST',
          body: JSON.stringify({
            id: firstMessage.id,
            chat_id: chat.id,
            msg_type: firstMessage.type,
            text: firstMessage.text,
            is_favorite: firstMessage.is_favorite || false,
          })
        });
      }
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
    
  } catch (err) {
    console.error('Action handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
