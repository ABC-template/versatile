// ============================================
// api/chats/actions/favorite.js
// Описание: Управление избранными сообщениями
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Переключить статус избранного для сообщения
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {string} messageId - ID сообщения
 * @param {boolean} isFavorite - Новый статус
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function toggleFavorite(userId, chatId, messageId, isFavorite, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        validateUUID(messageId, 'Message ID');
        
        // Проверяем, что чат принадлежит пользователю
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or access denied' };
        }
        
        // Проверяем, что сообщение существует в этом чате
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${messageId}&chat_id=eq.${chatId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: false, error: 'Message not found' };
        }
        
        // Обновляем статус избранного
        await supabaseFetch(
            `messages?id=eq.${messageId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    is_favorite: isFavorite,
                    updated_at: new Date().toISOString()
                })
            },
            config,
            'service'
        );
        
        return { success: true, error: null };
    } catch (err) {
        console.error('Toggle favorite error:', err.message);
        return { success: false, error: err.message };
    }
}

export default async function handler(request) {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;
    
    if (request.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }
    
    try {
        const auth = await authenticate(request);
        if (auth.error) {
            return errorResponse(auth.error, auth.status || 401);
        }
        
        const userId = auth.userId;
        const config = getSupabaseConfig('service');
        
        let body;
        try {
            body = await request.json();
        } catch (err) {
            return errorResponse('Invalid JSON body', 400);
        }
        
        const { action, chatId, messageId, isFavorite } = body;
        
        if (action !== 'favorite_message') {
            return errorResponse('Unknown action', 400);
        }
        
        if (!chatId || !messageId || isFavorite === undefined) {
            return errorResponse('Missing chatId, messageId or isFavorite', 400);
        }
        
        const result = await toggleFavorite(userId, chatId, messageId, isFavorite, config);
        if (!result.success) {
            return errorResponse(result.error, 400);
        }
        
        return jsonResponse({ success: true });
        
    } catch (err) {
        console.error('Favorite handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
