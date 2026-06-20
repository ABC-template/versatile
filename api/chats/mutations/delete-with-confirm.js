// ============================================
// api/chats/mutations/delete-with-confirm.js
// Описание: Удаление чата с подтверждением на всех устройствах
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Удалить чат с подтверждением
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {string} deviceFingerprint - Fingerprint устройства, инициировавшего удаление
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, pendingDevices: number, error: string|null }>}
 */
async function deleteChatWithConfirm(userId, chatId, deviceFingerprint, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
        if (!deviceFingerprint) {
            return { success: false, error: 'Device fingerprint is required' };
        }
        
        // Проверяем, что чат принадлежит пользователю и уже в корзине
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=not.is.null&select=id,created_at,user_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or not in trash' };
        }
        
        const chat = chatCheck[0];
        const entityCreatedAt = chat.created_at;
        
        // Получаем список активных устройств пользователя
        const devices = await supabaseFetch(
            `user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`,
            { method: 'GET' },
            config,
            'service'
        );
        
        const deviceFingerprints = (devices || [])
            .map(d => d.device_fingerprint)
            .filter(fp => fp && fp !== deviceFingerprint);
        
        // Удаляем все сообщения чата
        await supabaseFetch(
            `messages?chat_id=eq.${chatId}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        // Удаляем сам чат
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        // Создаем запись в pending_deletions для других устройств
        if (deviceFingerprints.length > 0) {
            const pendingId = crypto.randomUUID();
            
            await supabaseFetch(
                'pending_deletions',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        id: pendingId,
                        entity_type: 'chat',
                        user_id: userId,
                        entity_created_at: entityCreatedAt,
                        is_cleaned: false
                    })
                },
                config,
                'service'
            );
            
            // Добавляем устройства в pending_deletion_devices
            for (const fp of deviceFingerprints) {
                await supabaseFetch(
                    'pending_deletion_devices',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            pending_id: pendingId,
                            device_fingerprint: fp
                        })
                    },
                    config,
                    'service'
                );
            }
        }
        
        return {
            success: true,
            pendingDevices: deviceFingerprints.length,
            error: null
        };
    } catch (err) {
        console.error('Delete chat with confirm error:', err.message);
        return { success: false, pendingDevices: 0, error: err.message };
    }
}

/**
 * Удалить сообщение с подтверждением
 * @param {number} userId - ID пользователя
 * @param {string} messageId - ID сообщения
 * @param {string} deviceFingerprint - Fingerprint устройства
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, pendingDevices: number, error: string|null }>}
 */
async function deleteMessageWithConfirm(userId, messageId, deviceFingerprint, config) {
    try {
        validateUUID(messageId, 'Message ID');
        
        if (!deviceFingerprint) {
            return { success: false, error: 'Device fingerprint is required' };
        }
        
        // Проверяем, что сообщение принадлежит пользователю
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${messageId}&select=chat_id,created_at`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: false, error: 'Message not found' };
        }
        
        const chatId = msgCheck[0].chat_id;
        const entityCreatedAt = msgCheck[0].created_at;
        
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
        
        // Получаем список активных устройств
        const devices = await supabaseFetch(
            `user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`,
            { method: 'GET' },
            config,
            'service'
        );
        
        const deviceFingerprints = (devices || [])
            .map(d => d.device_fingerprint)
            .filter(fp => fp && fp !== deviceFingerprint);
        
        // Удаляем сообщение
        await supabaseFetch(
            `messages?id=eq.${messageId}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        // Создаем запись в pending_deletions для других устройств
        if (deviceFingerprints.length > 0) {
            const pendingId = crypto.randomUUID();
            
            await supabaseFetch(
                'pending_deletions',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        id: pendingId,
                        entity_type: 'message',
                        user_id: userId,
                        entity_created_at: entityCreatedAt,
                        is_cleaned: false
                    })
                },
                config,
                'service'
            );
            
            for (const fp of deviceFingerprints) {
                await supabaseFetch(
                    'pending_deletion_devices',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            pending_id: pendingId,
                            device_fingerprint: fp
                        })
                    },
                    config,
                    'service'
                );
            }
        }
        
        return {
            success: true,
            pendingDevices: deviceFingerprints.length,
            error: null
        };
    } catch (err) {
        console.error('Delete message with confirm error:', err.message);
        return { success: false, pendingDevices: 0, error: err.message };
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
        
        const { action, chatId, messageId, deviceFingerprint } = body;
        
        if (action === 'delete_chat_with_confirm') {
            if (!chatId || !deviceFingerprint) {
                return errorResponse('Missing chatId or deviceFingerprint', 400);
            }
            
            const result = await deleteChatWithConfirm(userId, chatId, deviceFingerprint, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                pendingDevices: result.pendingDevices
            });
            
        } else if (action === 'delete_message_with_confirm') {
            if (!messageId || !deviceFingerprint) {
                return errorResponse('Missing messageId or deviceFingerprint', 400);
            }
            
            const result = await deleteMessageWithConfirm(userId, messageId, deviceFingerprint, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                pendingDevices: result.pendingDevices
            });
            
        } else {
            return errorResponse('Unknown action', 400);
        }
        
    } catch (err) {
        console.error('Delete with confirm error:', err.message);
        return errorResponse(err.message, 500);
    }
}
