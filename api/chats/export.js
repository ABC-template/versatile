// api/chats/export.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

const MAX_EXPORT_SIZE_BYTES = 4000000;
const MAX_MESSAGES_PER_CHUNK = 1000;

export default async function handler(request) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
  };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  
  const isLocalExport = request.method === 'POST';
  
  let userId = null;
  let isAuthenticated = false;
  
  if (!isLocalExport) {
    try {
      const initData = request.headers.get('x-telegram-init-data');
      if (!initData) throw new Error('Missing init data');
      
      const botToken = process.env.BOT_TOKEN?.trim();
      if (!botToken) throw new Error('Bot token not configured');
      
      const user = await validateTelegramInitData(initData, botToken);
      if (!user) throw new Error('Invalid init data');
      
      userId = user.id;
      isAuthenticated = true;
    } catch (err) {
      console.error('Auth error:', err);
      return new Response(JSON.stringify({ error: err.message, fallbackToLocal: true }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }
  }

  // ==========================================
  // ЛОКАЛЬНЫЙ ЭКСПОРТ (без изменений)
  // ==========================================
  if (isLocalExport) {
    try {
      const body = await request.json();
      const { chatHistories, topicNames, exportOptions = {} } = body;
      
      if (!chatHistories) {
        return new Response(JSON.stringify({ error: 'No chat histories provided' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      const archive = [];
      let totalMessages = 0;
      let totalSize = 0;
      
      for (const [topicId, chats] of Object.entries(chatHistories)) {
        for (const chat of chats) {
          const sortedMessages = [...(chat.messages || [])].sort((a, b) => {
            if (a.created_at && b.created_at) {
              return new Date(a.created_at) - new Date(b.created_at);
            }
            return 0;
          });
          
          const chatArchive = {
            chat_id: chat.id,
            title: chat.title,
            topic_id: topicId,
            topic_name: topicNames?.[topicId] || topicId,
            max_context: chat.maxContext,
            user_renamed: chat.userRenamed || false,
            created_at: chat.created_at || new Date().toISOString(),
            updated_at: chat.updated_at || new Date().toISOString(),
            messages: sortedMessages
          };
          
          totalMessages += chatArchive.messages.length;
          archive.push(chatArchive);
        }
      }
      
      const archiveJson = JSON.stringify(archive);
      totalSize = new TextEncoder().encode(archiveJson).length;
      
      if (totalSize > MAX_EXPORT_SIZE_BYTES || totalMessages > MAX_MESSAGES_PER_CHUNK) {
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;
        let currentMessages = 0;
        
        for (const chat of archive) {
          const chatJson = JSON.stringify(chat);
          const chatSize = new TextEncoder().encode(chatJson).length;
          const chatMessages = chat.messages.length;
          
          if (currentChunk.length > 0 && 
              (currentSize + chatSize > MAX_EXPORT_SIZE_BYTES || 
               currentMessages + chatMessages > MAX_MESSAGES_PER_CHUNK)) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentSize = 0;
            currentMessages = 0;
          }
          
          currentChunk.push(chat);
          currentSize += chatSize;
          currentMessages += chatMessages;
        }
        
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        
        const part = parseInt(exportOptions.part || request.headers.get('X-Request-Part') || '1', 10);
        const totalParts = chunks.length;
        
        if (part > totalParts) {
          return new Response(JSON.stringify({ error: 'Invalid part number' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }
        
        return new Response(JSON.stringify({
          success: true,
          total_parts: totalParts,
          current_part: part,
          total_messages: totalMessages,
          archive: chunks[part - 1]
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'X-Total-Parts': totalParts.toString(),
            'X-Current-Part': part.toString()
          }
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        total_parts: 1,
        current_part: 1,
        total_messages: totalMessages,
        archive: archive
      }), { status: 200, headers: corsHeaders });
      
    } catch (err) {
      console.error('Local export error:', err);
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }

  // ==========================================
  // ОБЛАЧНЫЙ ЭКСПОРТ (С БЕЗОПАСНОЙ ЗАГРУЗКОЙ)
  // ==========================================
  try {
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
        throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
      }
      return res.json();
    }

    const userCheck = await supabaseFetch(`users?telegram_id=eq.${userId}&select=role,data_deadline,premium_until`);
    if (!userCheck || userCheck.length === 0) throw new Error('User not found');

    const currentUser = userCheck[0];
    const isPro = ['creator', 'admin', 'premium'].includes(currentUser.role);
    
    let hasGracePeriod = false;
    let daysLeft = 0;
    
    if (currentUser.data_deadline) {
      const deadline = new Date(currentUser.data_deadline);
      const now = new Date();
      if (deadline > now) {
        hasGracePeriod = true;
        daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      }
    }

    if (!isPro && !hasGracePeriod) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Скачивание облачного архива доступно только PRO-пользователям или в течение 7 дней после окончания подписки.',
        fallbackToLocal: true
      }), { status: 403, headers: corsHeaders });
    }

    const chats = await supabaseFetch(`chats?user_id=eq.${userId}&select=*&order=updated_at.desc`);
    
    let compiledArchive = [];
    let totalMessages = 0;

    if (chats.length > 0) {
      // ==========================================
      // БЕЗОПАСНАЯ ЗАГРУЗКА СООБЩЕНИЙ (Вариант 1)
      // Загружаем сообщения для каждого чата по отдельности
      // ==========================================
      let allMessages = [];
      
      for (const chat of chats) {
        try {
          // encodeURIComponent защищает от инъекций
          const encodedChatId = encodeURIComponent(chat.id);
          let offset = 0;
          const limit = 500;
          let hasMore = true;
          
          while (hasMore) {
            const messagesBatch = await supabaseFetch(
              `messages?chat_id=eq.${encodedChatId}&order=created_at.asc&limit=${limit}&offset=${offset}`
            );
            
            if (messagesBatch && messagesBatch.length > 0) {
              allMessages.push(...messagesBatch);
              offset += limit;
            } else {
              hasMore = false;
            }
          }
        } catch (err) {
          console.error(`Ошибка загрузки сообщений для чата ${chat.id}:`, err);
        }
      }
      
      totalMessages = allMessages.length;
      
      compiledArchive = chats.map(chat => {
        const chatMessages = allMessages.filter(m => m.chat_id === chat.id);
        return {
          chat_id: chat.id,
          title: chat.title,
          topic_id: chat.topic_id,
          max_context: chat.max_context,
          user_renamed: chat.user_renamed,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          messages: chatMessages.map(m => ({
            id: m.id,
            type: m.msg_type,
            text: m.text,
            is_favorite: m.is_favorite,
            created_at: m.created_at
          }))
        };
      });
    }
    
    const archiveData = {
      success: true,
      exported_at: new Date().toISOString(),
      user_id: userId,
      grace_period_days_left: hasGracePeriod ? daysLeft : null,
      archive: compiledArchive
    };
    
    const archiveJson = JSON.stringify(archiveData);
    const archiveSize = new TextEncoder().encode(archiveJson).length;
    
    if (archiveSize > MAX_EXPORT_SIZE_BYTES || totalMessages > MAX_MESSAGES_PER_CHUNK) {
      const chunks = [];
      let currentChunk = [];
      let currentSize = 0;
      let currentMessages = 0;
      
      for (const chat of compiledArchive) {
        const chatJson = JSON.stringify(chat);
        const chatSize = new TextEncoder().encode(chatJson).length;
        const chatMessages = chat.messages.length;
        
        if (currentChunk.length > 0 && 
            (currentSize + chatSize > MAX_EXPORT_SIZE_BYTES || 
             currentMessages + chatMessages > MAX_MESSAGES_PER_CHUNK)) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentSize = 0;
          currentMessages = 0;
        }
        
        currentChunk.push(chat);
        currentSize += chatSize;
        currentMessages += chatMessages;
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      
      const part = parseInt(request.headers.get('X-Request-Part') || '1', 10);
      const totalParts = chunks.length;
      
      if (part > totalParts) {
        return new Response(JSON.stringify({ error: 'Invalid part number' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        total_parts: totalParts,
        current_part: part,
        total_messages: totalMessages,
        grace_period_days_left: hasGracePeriod ? daysLeft : null,
        archive: chunks[part - 1]
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'X-Total-Parts': totalParts.toString(),
          'X-Current-Part': part.toString()
        }
      });
    }
    
    return new Response(archiveJson, { 
      status: 200, 
      headers: {
        ...corsHeaders,
        'Content-Disposition': `attachment; filename="versatile_ai_archive_${userId}.json"`
      } 
    });

  } catch (err) {
    console.error('Cloud export error:', err);
    return new Response(JSON.stringify({ 
      error: err.message,
      fallbackToLocal: true
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}ize = 0;
      let currentMessages = 0;
      
      for (const chat of compiledArchive) {
        const chatJson = JSON.stringify(chat);
        const chatSize = new TextEncoder().encode(chatJson).length;
        const chatMessages = chat.messages.length;
        
        if (currentChunk.length > 0 && 
            (currentSize + chatSize > MAX_EXPORT_SIZE_BYTES || 
             currentMessages + chatMessages > MAX_MESSAGES_PER_CHUNK)) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentSize = 0;
          currentMessages = 0;
        }
        
        currentChunk.push(chat);
        currentSize += chatSize;
        currentMessages += chatMessages;
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      
      const part = parseInt(request.headers.get('X-Request-Part') || '1', 10);
      const totalParts = chunks.length;
      
      if (part > totalParts) {
        return new Response(JSON.stringify({ error: 'Invalid part number' }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        total_parts: totalParts,
        current_part: part,
        total_messages: totalMessages,
        grace_period_days_left: hasGracePeriod ? daysLeft : null,
        archive: chunks[part - 1]
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'X-Total-Parts': totalParts.toString(),
          'X-Current-Part': part.toString()
        }
      });
    }
    
    // Отдаем одним файлом
    return new Response(archiveJson, { 
      status: 200, 
      headers: {
        ...corsHeaders,
        'Content-Disposition': `attachment; filename="versatile_ai_archive_${userId}.json"`
      } 
    });

  } catch (err) {
    console.error('Cloud export error:', err);
    return new Response(JSON.stringify({ 
      error: err.message,
      fallbackToLocal: true
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
                                                                  }
