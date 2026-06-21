// ============================================
// api/chats/get.js
// Описание: Получение чата с сообщениями (с ETag)
// ✅ ИСПРАВЛЕНО: добавлен фильтр deleted_at=is.null
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Получить все сообщения чата с пагинацией
 * @param {string} chatId - ID чата
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<Array>}
 */
async function getMessages(chatId, config) {
    const allMessages = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    
    while (hasMore) {
        // ✅ ИСПРАВЛЕНО: добавлен фильтр deleted_at=is.null
        const batch = await supabaseFetch(
            `messages?chat_id=eq.${chatId}&deleted_at=is.null&order=created_at.asc&limit=${limit}&offset=${offset}`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (batch && Array.isArray(batch) && batch.length > 0) {
            allMessages.push(...batch);
            offset += limit;
        } else {
            hasMore = false;
        }
    }
    
    return allMessages;
}

export default async function handler(request) {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;
    
    if (request.method !== 'GET') {
        return errorResponse('Method Not Allowed', 405);
    }
    
    try {
        const auth = await authenticate(request);
        if (auth.error) {
            return errorResponse(auth.error, auth.status || 401);
        }
        
        const userId = auth.userId;
        const config = getSupabaseConfig('service');
        
        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('id');
        
        if (!chatId) {
            return errorResponse('Missing chat id', 400);
        }
        
        if (!isValidUUID(chatId)) {
            return errorResponse('Invalid chat ID format', 400);
        }
        
        // Получаем чат (только не удалённые)
        const chat = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=*`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chat || !Array.isArray(chat) || chat.length === 0) {
            return errorResponse('Chat not found or access denied', 404);
        }
        
        const chatData = chat[0];
        
        // Проверка ETag
        const ifNoneMatch = request.headers.get('if-none-match');
        const etag = `"${chatData.updated_at || chatData.created_at}"`;
        
        if (ifNoneMatch === etag) {
            return new Response(null, {
                status: 304,
                headers: {
                    ...corsHeaders,
                    'ETag': etag
                }
            });
        }
        
        // Получаем сообщения с пагинацией (только не удалённые)
        const messages = await getMessages(chatId, config);
        
        return jsonResponse({
            success: true,
            chat: chatData,
            messages: messages || []
        }, 200, {
            'ETag': etag
        });
        
    } catch (err) {
        console.error('Get chat error:', err.message);
        return errorResponse(err.message, 500);
    }
}
