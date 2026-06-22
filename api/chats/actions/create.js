// ============================================
// api/chats/actions/create.js
// Описание: Создание нового чата
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, isValidTopic, validateTopic, validateUserId } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Создать новый чат
 * @param {number} userId - ID пользователя
 * @param {object} chatData - Данные чата
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, chatId: string, error: string|null }>}
 */
async function createChat(userId, chatData, config) {
    try {
        const chatId = chatData.id || crypto.randomUUID();
        const topic = chatData.topic_id || 'fast';
        const title = chatData.title || `Чат в разделе ${topic}`;
        const maxContext = chatData.max_context || 15;
        const userRenamed = chatData.user_renamed || false;
        
        validateTopic(topic);
        
        // Проверяем права на синхронизацию
        const canSync = await supabaseFetch(
            `users?telegram_id=eq.${userId}&select=role,premium_until`,
            { method: 'GET' },
            config,
            'service'
        );
        
        let syncAllowed = false;
        if (canSync && Array.isArray(canSync) && canSync.length > 0) {
            const user = canSync[0];
            if (['admin', 'creator'].includes(user.role)) {
                syncAllowed = true;
            } else if (user.role === 'premium' && user.premium_until && new Date(user.premium_until) > new Date()) {
                syncAllowed = true;
            }
        }
        
        if (!syncAllowed) {
            return {
                success: false,
                error: 'Синхронизация недоступна для вашего тарифного плана'
            };
        }
        
        // Создаем чат
        const result = await supabaseFetch(
            'chats',
            {
                method: 'POST',
                body: JSON.stringify({
                    id: chatId,
                    user_id: userId,
                    topic_id: topic,
                    title: title,
                    max_context: maxContext,
                    user_renamed: userRenamed,
                })
            },
            config,
            'service'
        );
        
        if (!result || typeof result !== 'object' || !result.id) {
            console.error('Create chat failed:', result);
            return {
                success: false,
                error: 'Не удалось создать чат в облаке'
            };
        }
        
        return {
            success: true,
            chatId: chatId,
            error: null
        };
    } catch (err) {
        console.error('Create chat error:', err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Создать чат с первым сообщением
 * @param {number} userId - ID пользователя
 * @param {object} chatData - Данные чата
 * @param {object} messageData - Данные сообщения
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, chatId: string, messageId: string|null, error: string|null }>}
 */
async function createChatWithMessage(userId, chatData, messageData, config) {
    try {
        // Создаем чат
        const chatResult = await createChat(userId, chatData, config);
        if (!chatResult.success) {
            return chatResult;
        }
        
        const chatId = chatResult.chatId;
        let messageId = null;
        
        // Создаем сообщение, если есть
        if (messageData && messageData.text) {
            const msgId = messageData.id || crypto.randomUUID();
            const msgType = messageData.type || 'user-msg';
            
            const result = await supabaseFetch(
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
            
            if (result && typeof result === 'object' && result.id) {
                messageId = msgId;
            } else {
                console.warn('Message created but response invalid:', result);
                messageId = msgId;
            }
        }
        
        return {
            success: true,
            chatId: chatId,
            messageId: messageId,
            error: null
        };
    } catch (err) {
        console.error('Create chat with message error:', err.message);
        return {
            success: false,
            error: err.message
        };
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
        
        const { chat, firstMessage, action } = body;
        
        if (!chat) {
            return errorResponse('Missing chat data', 400);
        }
        
        if (chat.topic_id && !isValidTopic(chat.topic_id)) {
            return errorResponse(`Invalid topic: ${chat.topic_id}`, 400);
        }
        
        const result = await createChatWithMessage(
            userId,
            chat,
            firstMessage || null,
            config
        );
        
        if (!result.success) {
            return errorResponse(result.error, 400);
        }
        
        return jsonResponse({
            success: true,
            chatId: result.chatId,
            messageId: result.messageId
        });
        
    } catch (err) {
        console.error('Create chat handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
