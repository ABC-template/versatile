// ============================================
// api/chats/trash.js
// Описание: Работа с корзиной (GET, POST, DELETE)
// ✅ ИСПРАВЛЕНО: восстановление чата — только сообщения, удаленные с ним
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Получить содержимое корзины (с пагинацией и без N+1)
 */
async function getTrash(userId, config, limit = 100, offset = 0) {
    // Получаем удалённые чаты с пагинацией
    const deletedChats = await supabaseFetch(
        `chats?user_id=eq.${userId}&deleted_at=not.is.null&select=id,title,topic_id,deleted_at,created_at&order=deleted_at.desc&limit=${limit}&offset=${offset}`,
        { method: 'GET' },
        config,
        'service'
    );
    
    let deletedMessages = [];
    
    if (deletedChats && Array.isArray(deletedChats) && deletedChats.length > 0) {
        const chatIds = deletedChats.map(c => c.id).join(',');
        
        const messagesWithChats = await supabaseFetch(
            `messages?chat_id=in.(${chatIds})&deleted_at=not.is.null&select=id,text,chat_id,deleted_at,created_at,chats!inner(title)&order=deleted_at.desc&limit=${limit}&offset=${offset}`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (messagesWithChats && Array.isArray(messagesWithChats)) {
            deletedMessages = messagesWithChats.map(msg => ({
                ...msg,
                chat_title: msg.chats?.title || 'Unknown'
            }));
            deletedMessages = deletedMessages.map(({ chats, ...rest }) => rest);
        }
    }
    
    return {
        chats: deletedChats || [],
        messages: deletedMessages || []
    };
}

/**
 * ✅ ИСПРАВЛЕНО: Восстановить из корзины
 * При восстановлении чата — восстанавливаем ТОЛЬКО сообщения,
 * которые были удалены вместе с чатом (имеют ту же дату deleted_at)
 */
async function restoreFromTrash(userId, id, type, config) {
    validateUUID(id, 'ID');
    
    const now = new Date().toISOString();
    
    if (type === 'chat') {
        // Проверяем, что чат принадлежит пользователю и находится в корзине
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${id}&user_id=eq.${userId}&deleted_at=not.is.null&select=id,deleted_at`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or not in trash' };
        }
        
        const chatDeletedAt = chatCheck[0].deleted_at;
        
        // ✅ ИСПРАВЛЕНО: Восстанавливаем ТОЛЬКО сообщения, 
        // которые были удалены вместе с чатом (та же дата deleted_at)
        await supabaseFetch(
            `messages?chat_id=eq.${id}&deleted_at=eq.${encodeURIComponent(chatDeletedAt)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    deleted_at: null,
                    updated_at: now
                })
            },
            config,
            'service'
        );
        
        // Восстанавливаем сам чат
        await supabaseFetch(
            `chats?id=eq.${id}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    deleted_at: null, 
                    updated_at: now
                })
            },
            config,
            'service'
        );
        
        console.log(`♻️ Восстановлен чат ${id} и сообщения, удаленные с ним (${chatDeletedAt})`);
        
    } else if (type === 'message') {
        // Проверяем, что сообщение принадлежит пользователю через чат и находится в корзине
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${id}&deleted_at=not.is.null&select=chat_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: false, error: 'Message not found or not in trash' };
        }
        
        const chatId = msgCheck[0].chat_id;
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Access denied' };
        }
        
        // Восстанавливаем сообщение
        await supabaseFetch(
            `messages?id=eq.${id}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ 
                    deleted_at: null,
                    updated_at: now
                })
            },
            config,
            'service'
        );
        
        // Обновляем чат
        await supabaseFetch(
            `chats?id=eq.${chatId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ updated_at: now })
            },
            config,
            'service'
        );
        
        console.log(`♻️ Восстановлено сообщение ${id}`);
        
    } else {
        return { success: false, error: 'Invalid type' };
    }
    
    return { success: true };
}

/**
 * Удалить навсегда (HARD DELETE) с проверкой дубликатов
 */
async function permanentDeleteFromTrash(userId, id, type, deviceFingerprint, config) {
    validateUUID(id, 'ID');
    
    if (!deviceFingerprint) {
        return { success: false, error: 'Device fingerprint is required' };
    }
    
    if (type === 'chat') {
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${id}&user_id=eq.${userId}&deleted_at=not.is.null&select=id,created_at`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or not in trash' };
        }
        
        const entityCreatedAt = chatCheck[0].created_at;
        
        const devices = await supabaseFetch(
            `user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`,
            { method: 'GET' },
            config,
            'service'
        );
        
        const deviceFingerprints = (devices || [])
            .map(d => d.device_fingerprint)
            .filter(fp => fp && fp !== deviceFingerprint);
        
        // Удаляем сообщения и чат
        await supabaseFetch(`messages?chat_id=eq.${id}`, { method: 'DELETE' }, config, 'service');
        await supabaseFetch(`chats?id=eq.${id}`, { method: 'DELETE' }, config, 'service');
        
        if (deviceFingerprints.length > 0) {
            const existingPending = await supabaseFetch(
                `pending_deletions?user_id=eq.${userId}&entity_type=eq.chat&parent_id=eq.${id}&is_cleaned=eq.false&select=id`,
                { method: 'GET' },
                config,
                'service'
            );
            
            if (!existingPending || !Array.isArray(existingPending) || existingPending.length === 0) {
                const pendingId = crypto.randomUUID();
                
                await supabaseFetch(
                    'pending_deletions',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            id: pendingId,
                            entity_type: 'chat',
                            parent_id: id,
                            user_id: userId,
                            entity_created_at: entityCreatedAt,
                            is_cleaned: false
                        })
                    },
                    config,
                    'service'
                );
                
                for (const fp of deviceFingerprints) {
                    try {
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
                    } catch (err) {
                        console.error(`Ошибка добавления устройства ${fp}:`, err.message);
                    }
                }
            }
        }
        
        return { success: true, pendingDevices: deviceFingerprints.length };
        
    } else if (type === 'message') {
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${id}&select=chat_id,created_at`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: false, error: 'Message not found' };
        }
        
        const chatId = msgCheck[0].chat_id;
        const entityCreatedAt = msgCheck[0].created_at;
        
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Access denied' };
        }
        
        const devices = await supabaseFetch(
            `user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`,
            { method: 'GET' },
            config,
            'service'
        );
        
        const deviceFingerprints = (devices || [])
            .map(d => d.device_fingerprint)
            .filter(fp => fp && fp !== deviceFingerprint);
        
        await supabaseFetch(`messages?id=eq.${id}`, { method: 'DELETE' }, config, 'service');
        
        if (deviceFingerprints.length > 0) {
            const existingPending = await supabaseFetch(
                `pending_deletions?user_id=eq.${userId}&entity_type=eq.message&parent_id=eq.${id}&is_cleaned=eq.false&select=id`,
                { method: 'GET' },
                config,
                'service'
            );
            
            if (!existingPending || !Array.isArray(existingPending) || existingPending.length === 0) {
                const pendingId = crypto.randomUUID();
                
                await supabaseFetch(
                    'pending_deletions',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            id: pendingId,
                            entity_type: 'message',
                            parent_id: id,
                            user_id: userId,
                            entity_created_at: entityCreatedAt,
                            is_cleaned: false
                        })
                    },
                    config,
                    'service'
                );
                
                for (const fp of deviceFingerprints) {
                    try {
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
                    } catch (err) {
                        console.error(`Ошибка добавления устройства ${fp}:`, err.message);
                    }
                }
            }
        }
        
        return { success: true, pendingDevices: deviceFingerprints.length };
    }
    
    return { success: false, error: 'Invalid type' };
}

export default async function handler(request) {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;
    
    try {
        const auth = await authenticate(request);
        if (auth.error) {
            return errorResponse(auth.error, auth.status || 401);
        }
        
        const userId = auth.userId;
        const config = getSupabaseConfig('service');
        
        // GET - получить корзину (с пагинацией)
        if (request.method === 'GET') {
            const url = new URL(request.url);
            const limit = parseInt(url.searchParams.get('limit') || '100', 10);
            const offset = parseInt(url.searchParams.get('offset') || '0', 10);
            
            const trash = await getTrash(userId, config, Math.min(limit, 500), offset);
            return jsonResponse({
                success: true,
                ...trash,
                limit: Math.min(limit, 500),
                offset: offset
            });
        }
        
        // POST - восстановление
        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch (err) {
                return errorResponse('Invalid JSON body', 400);
            }
            
            const { id, type } = body;
            if (!id || !type) {
                return errorResponse('Missing id or type', 400);
            }
            
            const result = await restoreFromTrash(userId, id, type, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({ success: true });
        }
        
        // DELETE - удаление навсегда
        if (request.method === 'DELETE') {
            let body;
            try {
                body = await request.json();
            } catch (err) {
                return errorResponse('Invalid JSON body', 400);
            }
            
            const { id, type, deviceFingerprint } = body;
            if (!id || !type || !deviceFingerprint) {
                return errorResponse('Missing id, type or deviceFingerprint', 400);
            }
            
            const result = await permanentDeleteFromTrash(userId, id, type, deviceFingerprint, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                pendingDevices: result.pendingDevices || 0
            });
        }
        
        return errorResponse('Method Not Allowed', 405);
        
    } catch (err) {
        console.error('Trash handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
