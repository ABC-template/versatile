// ============================================
// api/chats/trash.js
// Описание: Работа с корзиной (GET, POST, DELETE)
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Получить содержимое корзины
 */
async function getTrash(userId, config) {
    // Получаем удалённые чаты
    const deletedChats = await supabaseFetch(
        `chats?user_id=eq.${userId}&deleted_at=not.is.null&select=id,title,topic_id,deleted_at,created_at&order=deleted_at.desc`,
        { method: 'GET' },
        config,
        'service'
    );
    
    // Получаем ID всех чатов пользователя (включая удалённые)
    const allUserChats = await supabaseFetch(
        `chats?user_id=eq.${userId}&select=id`,
        { method: 'GET' },
        config,
        'service'
    );
    
    let deletedMessages = [];
    if (allUserChats && Array.isArray(allUserChats) && allUserChats.length > 0) {
        const chatIds = allUserChats.map(c => c.id).join(',');
        
        deletedMessages = await supabaseFetch(
            `messages?chat_id=in.(${chatIds})&deleted_at=not.is.null&select=id,text,chat_id,deleted_at,created_at&order=deleted_at.desc`,
            { method: 'GET' },
            config,
            'service'
        );
        
        // Добавляем название чата к каждому сообщению
        for (const msg of (deletedMessages || [])) {
            const chat = await supabaseFetch(
                `chats?id=eq.${msg.chat_id}&select=title`,
                { method: 'GET' },
                config,
                'service'
            );
            msg.chat_title = (chat && chat[0]) ? chat[0].title : 'Unknown';
        }
    }
    
    return {
        chats: deletedChats || [],
        messages: deletedMessages || []
    };
}

/**
 * Восстановить из корзины
 */
async function restoreFromTrash(userId, id, type, config) {
    validateUUID(id, 'ID');
    
    if (type === 'chat') {
        // Проверяем, что чат принадлежит пользователю
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${id}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, error: 'Chat not found or access denied' };
        }
        
        await supabaseFetch(
            `chats?id=eq.${id}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ deleted_at: null, updated_at: new Date().toISOString() })
            },
            config,
            'service'
        );
        
    } else if (type === 'message') {
        // Проверяем, что сообщение принадлежит пользователю через чат
        const msgCheck = await supabaseFetch(
            `messages?id=eq.${id}&select=chat_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
            return { success: false, error: 'Message not found' };
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
        
        await supabaseFetch(
            `messages?id=eq.${id}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ deleted_at: null, updated_at: new Date().toISOString() })
            },
            config,
            'service'
        );
        
    } else {
        return { success: false, error: 'Invalid type' };
    }
    
    return { success: true };
}

/**
 * Удалить навсегда (HARD DELETE) с подтверждением
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
        
        // Удаляем сообщения и чат
        await supabaseFetch(`messages?chat_id=eq.${id}`, { method: 'DELETE' }, config, 'service');
        await supabaseFetch(`chats?id=eq.${id}`, { method: 'DELETE' }, config, 'service');
        
        // Создаем запись в pending_deletions
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
        
        // GET - получить корзину
        if (request.method === 'GET') {
            const trash = await getTrash(userId, config);
            return jsonResponse({
                success: true,
                ...trash
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
