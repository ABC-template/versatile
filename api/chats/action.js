// api/chats/action.js - ЧАСТЬ 1
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { scheduleSilentPush } from '../_lib/send-push.js';
import { isValidUUID, validateChatId, validateMessageId } from '../_lib/validate-uuid.js';

export const config = { runtime: 'edge' };

function generateUUID() {
    return crypto.randomUUID();
}

export default async function handler(request) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Device-Fingerprint',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

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
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || body.deviceFingerprint || null;
    
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    
    const { action, chatId, message, messageId, newTitle, isFavorite, maxContext, chat, firstMessage } = body;
    
    async function supabaseFetch(path, options = {}) {
      const url = `${supabaseUrl}/rest/v1/${path}`;
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': options.method === 'POST' ? 'return=representation' : undefined
      };
      
      Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);
      
      const res = await fetch(url, { ...options, headers });
      
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
        if (options.method === 'POST') {
          return Array.isArray(data) ? (data[0] || data) : data;
        }
        return data;
      }
      
      return { success: true };
    }
    
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
    // НОВОЕ СООБЩЕНИЕ
    // ==========================================
    if (action === 'new_message') {
      console.log("🔥 [new_message] Начало обработки", { chatId, userId, messageId: message?.id });

      // ВАЛИДАЦИЯ CHAT_ID (если передан)
      if (chatId && !isValidUUID(chatId)) {
        return new Response(JSON.stringify({ error: 'Invalid chat ID format' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      let chatExists = false;
      let existingChat = null;
      let finalChatId = chatId;
      
      try {
        const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id,topic_id,title,max_context,user_renamed`);
        if (chatCheck && Array.isArray(chatCheck) && chatCheck.length > 0) {
          chatExists = true;
          existingChat = chatCheck[0];
          finalChatId = chatId;
        }
      } catch (err) {
        console.error('Ошибка проверки чата:', err);
      }
      
      if (!chatExists) {
        console.log("⚠️ [new_message] Чат не найден, создаём новый");
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
        
        finalChatId = generateUUID();
        
        try {
          await supabaseFetch('chats', {
            method: 'POST',
            body: JSON.stringify({
              id: finalChatId,
              user_id: userId,
              topic_id: chatTopic,
              title: chatTitle,
              max_context: chatMaxContext,
              user_renamed: chatUserRenamed,
            })
          });
          chatExists = true;
          
          return new Response(JSON.stringify({ 
            success: true, 
            synced: true, 
            chatId: finalChatId 
          }), { status: 200, headers: corsHeaders });
        } catch (createErr) {
          console.error('Ошибка создания чата:', createErr);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Не удалось создать чат в облаке',
            synced: false 
          }), { status: 200, headers: corsHeaders });
        }
      }
      
      if (chatExists && message) {
        // ВАЛИДАЦИЯ ID СООБЩЕНИЯ
        if (message.id && !isValidUUID(message.id)) {
          return new Response(JSON.stringify({ error: 'Invalid message ID format' }), {
            status: 400,
            headers: corsHeaders
          });
        }
        
        console.log("📝 Сохраняем сообщение", { chatId: finalChatId, messageId: message.id, type: message.type });
        
        try {
          const finalMessageId = message.id || generateUUID();
          
          const updateResult = await supabaseFetch(`messages?id=eq.${finalMessageId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              chat_id: finalChatId,
              msg_type: message.type,
              text: message.text,
              is_favorite: message.isFavorite || false,
            })
          });
          
          const noRowsUpdated = !updateResult || 
            updateResult.success === true ||
            (Array.isArray(updateResult) && updateResult.length === 0) ||
            (updateResult.message && updateResult.message.includes('no rows'));
          
          if (noRowsUpdated) {
            await supabaseFetch('messages', {
              method: 'POST',
              body: JSON.stringify({
                id: finalMessageId,
                chat_id: finalChatId,
                msg_type: message.type,
                text: message.text,
                is_favorite: message.isFavorite || false,
              })
            });
          }
          
          await supabaseFetch(`chats?id=eq.${finalChatId}`, {
            method: 'PATCH',
            body: JSON.stringify({ updated_at: new Date().toISOString() })
          });
          
          const botToken = process.env.BOT_TOKEN?.trim();
          scheduleSilentPush(userId, botToken);
          
          return new Response(JSON.stringify({ 
            success: true, 
            synced: true,
            messageId: finalMessageId,
            chatId: finalChatId
          }), { status: 200, headers: corsHeaders });
          
        } catch (msgErr) {
          console.error("❌ Ошибка при сохранении сообщения:", msgErr);
          if (msgErr.message && (msgErr.message.includes('duplicate key') || msgErr.message.includes('409'))) {
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
      
      // ВАЛИДАЦИЯ CHAT_ID
      if (batchChatId && !isValidUUID(batchChatId)) {
        return new Response(JSON.stringify({ error: 'Invalid chat ID format' }), {
          status: 400,
          headers: corsHeaders
        });
      }
      
      // ВАЛИДАЦИЯ КАЖДОГО MESSAGE ID
      if (batchMessages && Array.isArray(batchMessages)) {
        for (const msg of batchMessages) {
          if (msg.id && !isValidUUID(msg.id)) {
            return new Response(JSON.stringify({ error: 'Invalid message ID format in batch' }), {
              status: 400,
              headers: corsHeaders
            });
          }
        }
      }
      
      if (!batchMessages || !Array.isArray(batchMessages) || batchMessages.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No messages to save' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      let chatExists = false;
      let finalBatchChatId = batchChatId;
      
      try {
        const chatCheck = await supabaseFetch(`chats?id=eq.${batchChatId}&user_id=eq.${userId}&select=id`);
        chatExists = chatCheck && Array.isArray(chatCheck) && chatCheck.length > 0;
        if (!chatExists) {
          finalBatchChatId = generateUUID();
        }
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
            id: finalBatchChatId,
            user_id: userId,
            topic_id: topicId || 'fast',
            title: chatTitle || 'Новый чат',
            max_context: maxContext || 15,
            user_renamed: userRenamed || false,
          })
        });
      }
      
      for (const msg of batchMessages) {
        try {
          const finalMsgId = msg.id || generateUUID();
          
          await supabaseFetch(`messages?id=eq.${finalMsgId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              chat_id: finalBatchChatId,
              msg_type: msg.type,
              text: msg.text,
              is_favorite: msg.isFavorite || false,
            })
          });
        } catch (err) {
          if (err.message && err.message.includes('no rows')) {
            await supabaseFetch('messages', {
              method: 'POST',
              body: JSON.stringify({
                id: msg.id || generateUUID(),
                chat_id: finalBatchChatId,
                msg_type: msg.type,
                text: msg.text,
                is_favorite: msg.isFavorite || false,
              })
            });
          }
        }
      }
      
      await supabaseFetch(`chats?id=eq.${finalBatchChatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ success: true, synced: true, count: batchMessages.length, chatId: finalBatchChatId }), { 
        status: 200, 
        headers: corsHeaders 
      });
      }
      // api/chats/action.js - ЧАСТЬ 2 (продолжение)
    
    // ==========================================
    // УДАЛЕНИЕ ЧАТА
    // ==========================================
    if (action === 'delete_chat') {
      // ВАЛИДАЦИЯ
      const validationError = validateChatId(chatId, corsHeaders);
      if (validationError) return validationError;
      
      if (!chatId) {
        return new Response(JSON.stringify({ error: 'Missing chatId' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        return new Response(JSON.stringify({ success: true, alreadyDeleted: true }), { 
          status: 200, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() })
      });
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================
    if (action === 'delete_message') {
      // ВАЛИДАЦИЯ
      const chatValidationError = validateChatId(chatId, corsHeaders);
      if (chatValidationError) return chatValidationError;
      
      const msgValidationError = validateMessageId(messageId, corsHeaders);
      if (msgValidationError) return msgValidationError;
      
      if (!messageId || !chatId) {
        return new Response(JSON.stringify({ error: 'Missing messageId or chatId' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const msgCheck = await supabaseFetch(`messages?id=eq.${messageId}&select=id,chat_id`);
      if (!msgCheck || (Array.isArray(msgCheck) && msgCheck.length === 0)) {
        return new Response(JSON.stringify({ success: true, alreadyDeleted: true }), { 
          status: 200, 
          headers: corsHeaders 
        });
      }
      
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), { 
          status: 403, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`messages?id=eq.${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() })
      });
      
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ПЕРЕИМЕНОВАНИЕ ЧАТА
    // ==========================================
    if (action === 'rename_chat') {
      // ВАЛИДАЦИЯ
      const validationError = validateChatId(chatId, corsHeaders);
      if (validationError) return validationError;
      
      if (!chatId || !newTitle) {
        return new Response(JSON.stringify({ error: 'Missing chatId or newTitle' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        return new Response(JSON.stringify({ error: 'Chat not found or access denied' }), { 
          status: 404, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`chats?id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle, user_renamed: true })
      });
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ИЗБРАННОЕ СООБЩЕНИЕ
    // ==========================================
    if (action === 'favorite_message') {
      // ВАЛИДАЦИЯ
      const chatValidationError = validateChatId(chatId, corsHeaders);
      if (chatValidationError) return chatValidationError;
      
      const msgValidationError = validateMessageId(messageId, corsHeaders);
      if (msgValidationError) return msgValidationError;
      
      if (!messageId || !chatId || isFavorite === undefined) {
        return new Response(JSON.stringify({ error: 'Missing messageId, chatId or isFavorite' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), { 
          status: 403, 
          headers: corsHeaders 
        });
      }
      
      await supabaseFetch(`messages?id=eq.${messageId}&chat_id=eq.${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: isFavorite })
      });
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    
    // ==========================================
    // ОБНОВЛЕНИЕ КОНТЕКСТА (память чата)
    // ==========================================
    if (action === 'update_context') {
      // ВАЛИДАЦИЯ
      const validationError = validateChatId(chatId, corsHeaders);
      if (validationError) return validationError;
      
      if (!chatId || maxContext === undefined) {
        return new Response(JSON.stringify({ error: 'Missing chatId or maxContext' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const chatCheck = await supabaseFetch(`chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`);
      if (!chatCheck || (Array.isArray(chatCheck) && chatCheck.length === 0)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), { 
          status: 403, 
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
    // НОВЫЙ ЧАТ (ID генерируется на сервере)
    // ==========================================
    if (action === 'new_chat') {
      // ВАЛИДАЦИЯ НЕ ТРЕБУЕТСЯ - ID генерируется на сервере
      
      if (!chat) {
        return new Response(JSON.stringify({ error: 'Missing chat' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const canSync = await canUserSync();
      if (!canSync) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Создание облачных чатов доступно только PRO-пользователям' 
        }), { status: 403, headers: corsHeaders });
      }
      
      const newChatId = generateUUID();
      
      await supabaseFetch('chats', {
        method: 'POST',
        body: JSON.stringify({
          id: newChatId,
          user_id: userId,
          topic_id: chat.topic_id,
          title: chat.title,
          max_context: chat.max_context || 15,
          user_renamed: chat.user_renamed || false,
        })
      });
      
      let firstMessageId = null;
      if (firstMessage) {
        firstMessageId = generateUUID();
        await supabaseFetch('messages', {
          method: 'POST',
          body: JSON.stringify({
            id: firstMessageId,
            chat_id: newChatId,
            msg_type: firstMessage.type,
            text: firstMessage.text,
            is_favorite: firstMessage.is_favorite || false,
          })
        });
      }
      
      const botToken = process.env.BOT_TOKEN?.trim();
      scheduleSilentPush(userId, botToken);
      
      return new Response(JSON.stringify({ 
        success: true, 
        chatId: newChatId,
        messageId: firstMessageId
      }), { status: 200, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
    
  } catch (err) {
    console.error('Action handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
