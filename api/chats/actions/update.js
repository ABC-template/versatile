// ============================================
// api/chats/actions/update.js
// Описание: Обновление чата (переименование, контекст, удаление)
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Переименовать чат
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {string} newTitle - Новое название
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function renameChat(userId, chatId, newTitle, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
        if (!newTitle || newTitle.trim().length === 0) {
            return { success: false, error: 'Title is required' };
        }
        
        const title = newTitle.trim();
        if (title.length > 200) {
            return { success: false, error: 'Title too long (max 200 characters)' };
        }
        
        // Проверяем, что чат принадлежит пользователю и не удалён
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or access denied' };
        }
        
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    title: title,
                    user_renamed: true,
                    updated_at: new Date().toISOString()
                })
            },
            config,
            'service'
        );
        
        return { success: true, error: null };
    } catch (err) {
        console.error('Rename chat error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Обновить контекст (память) чата
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {number} maxContext - Максимальное количество сообщений
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function updateContext(userId, chatId, maxContext, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
        const context = parseInt(maxContext, 10);
        if (isNaN(context) || context < 1 || context > 40) {
            return { success: false, error: 'Context must be between 1 and 40' };
        }
        
        // Проверяем, что чат принадлежит пользователю и не удалён
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or access denied' };
        }
        
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    max_context: context,
                    updated_at: new Date().toISOString()
                })
            },
            config,
            'service'
        );
        
        return { success: true, error: null };
    } catch (err) {
        console.error('Update context error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * ✅ ИСПРАВЛЕНО: Удалить чат (soft delete) с пометкой всех сообщений
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function deleteChat(userId, chatId, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
        // ✅ ИСПРАВЛЕНО: проверяем, что чат существует и ещё не удалён
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or already deleted' };
        }
        
        const now = new Date().toISOString();
        
        // ✅ ИСПРАВЛЕНО: 1. Помечаем ВСЕ сообщения чата как удалённые
        await supabaseFetch(
            `messages?chat_id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    deleted_at: now,
                    updated_at: now
                })
            },
            config,
            'service'
        );
        
        // ✅ ИСПРАВЛЕНО: 2. Помечаем сам чат как удалённый
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    deleted_at: now,
                    updated_at: now
                })
            },
            config,
            'service'
        );
        
        console.log(`🗑️ Чат ${chatId} и все его сообщения помечены как удалённые`);
        return { success: true, error: null };
    } catch (err) {
        console.error('Delete chat error:', err.message);
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
        
        const { action, chatId, newTitle, maxContext } = body;
        
        // ==========================================
        // ПЕРЕИМЕНОВАНИЕ
        // ==========================================
        if (action === 'rename_chat') {
            if (!chatId || !newTitle) {
                return errorResponse('Missing chatId or newTitle', 400);
            }
            
            const result = await renameChat(userId, chatId, newTitle, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({ success: true });
        }
        
        // ==========================================
        // ОБНОВЛЕНИЕ КОНТЕКСТА
        // ==========================================
        if (action === 'update_context') {
            if (!chatId || maxContext === undefined) {
                return errorResponse('Missing chatId or maxContext', 400);
            }
            
            const result = await updateContext(userId, chatId, maxContext, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({ success: true });
        }
        
        // ==========================================
        // ✅ ИСПРАВЛЕНО: УДАЛЕНИЕ ЧАТА
        // ==========================================
        if (action === 'delete_chat') {
            if (!chatId) {
                return errorResponse('Missing chatId', 400);
            }
            
            const result = await deleteChat(userId, chatId, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({ success: true });
        }
        
        return errorResponse('Unknown action', 400);
        
    } catch (err) {
        console.error('Update handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
