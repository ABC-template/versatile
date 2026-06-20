// ============================================
// api/chats/actions/message.js
// Описание: Работа с сообщениями (создание, удаление)
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, validateUUID, validateMessageLength } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Добавить сообщение в чат
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {object} messageData - Данные сообщения
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, messageId: string, error: string|null }>}
 */
async function addMessage(userId, chatId, messageData, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
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
        
        // Валидация сообщения
        const validation = validateMessageLength(messageData.text);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        
        const msgId = messageData.id || crypto.randomUUID();
        const msgType = messageData.type || 'user-msg';
        
        // Проверяем, существует ли уже сообщение с таким ID
        const existingCheck = await supabaseFetch(
            `messages?id=eq.${msgId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (existingCheck && Array.isArray(existingCheck) && existingCheck.length > 0) {
            // Обновляем существующее
            await supabaseFetch(
                `messages?id=eq.${msgId}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        chat_id: chatId,
                        msg_type: msgType,
                        text: messageData.text,
                        is_favorite: messageData.is_favorite || false,
                        deleted_at: null
                    })
                },
                config,
                'service'
            );
        } else {
            // Создаем новое
            await supabaseFetch(
                'messages',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        id: msgId,
                        chat_id: chatId,
                        msg_type: msgType,
                        text: messageData.text,
                        is_favorite: messageData.is_favorite || false,
                    })
                },
                config,
                'service'
            );
        }
        
        // Обновляем updated_at чата
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ updated_at: new Date().toISOString() })
            },
            config,
            'service'
        );
        
        return { success: true, messageId: msgId, error: null };
    } catch (err) {
        console.error('Add message error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Удалить сообщение (soft delete)
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {string} messageId - ID сообщения
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function deleteMessage(userId, chatId, messageId, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        validateUUID(messageId, 'Message ID');
        
        // Проверяем, что сообщение принадлежит пользователю
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${messageId}&select=chat_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: true, alreadyDeleted: true };
        }
        
        // Проверяем, что чат принадлежит пользователю
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Access denied' };
        }
        
        // Soft delete
        await supabaseFetch(
            `messages?id=eq.${messageId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ deleted_at: new Date().toISOString() })
            },
            config,
            'service'
        );
        
        // Обновляем updated_at чата
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ updated_at: new Date().toISOString() })
            },
            config,
            'service'
        );
        
        return { success: true, error: null };
    } catch (err) {
        console.error('Delete message error:', err.message);
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
        
        const { action, chatId, message, messageId } = body;
        
        if (action === 'new_message') {
            // Добавление сообщения
            if (!chatId || !message) {
                return errorResponse('Missing chatId or message', 400);
            }
            
            const result = await addMessage(userId, chatId, message, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                synced: true,
                messageId: result.messageId,
                chatId: chatId
            });
            
        } else if (action === 'delete_message') {
            // Удаление сообщения
            if (!chatId || !messageId) {
                return errorResponse('Missing chatId or messageId', 400);
            }
            
            const result = await deleteMessage(userId, chatId, messageId, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                alreadyDeleted: result.alreadyDeleted || false
            });
            
        } else {
            return errorResponse('Unknown action', 400);
        }
        
    } catch (err) {
        console.error('Message handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
