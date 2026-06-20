// ============================================
// api/chats/actions/batch.js
// Описание: Массовые операции с сообщениями
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch, canUserSync } from '../../_lib/supabase-client.js';
import { isValidUUID, isValidTopic, validateTopic, validateMessageLength } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

/**
 * Массовое добавление сообщений
 * @param {number} userId - ID пользователя
 * @param {string} chatId - ID чата
 * @param {Array} messages - Массив сообщений
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, count: number, error: string|null }>}
 */
async function batchAddMessages(userId, chatId, messages, config) {
    try {
        validateUUID(chatId, 'Chat ID');
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return { success: false, count: 0, error: 'No messages to save' };
        }
        
        // Проверяем права на синхронизацию
        const canSync = await canUserSync(userId, config);
        if (!canSync) {
            return {
                success: false,
                count: 0,
                error: 'Синхронизация недоступна для вашего тарифного плана'
            };
        }
        
        // Проверяем, что чат принадлежит пользователю
        const chatCheck = await supabaseFetch(
            `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
            return { success: false, count: 0, error: 'Chat not found or access denied' };
        }
        
        let savedCount = 0;
        
        for (const msg of messages) {
            // Валидация сообщения
            const validation = validateMessageLength(msg.text);
            if (!validation.valid) {
                console.warn('Skipping invalid message:', validation.error);
                continue;
            }
            
            const msgId = msg.id || crypto.randomUUID();
            const msgType = msg.type || 'user-msg';
            
            try {
                await supabaseFetch(
                    'messages',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            id: msgId,
                            chat_id: chatId,
                            msg_type: msgType,
                            text: msg.text,
                            is_favorite: msg.is_favorite || false,
                        })
                    },
                    config,
                    'service'
                );
                savedCount++;
            } catch (err) {
                console.error('Failed to save message:', err.message);
            }
        }
        
        // Обновляем updated_at чата
        if (savedCount > 0) {
            await supabaseFetch(
                `chats?id=eq.${chatId}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ updated_at: new Date().toISOString() })
                },
                config,
                'service'
            );
        }
        
        return { success: true, count: savedCount, error: null };
    } catch (err) {
        console.error('Batch add messages error:', err.message);
        return { success: false, count: 0, error: err.message };
    }
}

/**
 * Создать чат и добавить batch сообщений
 * @param {number} userId - ID пользователя
 * @param {object} chatData - Данные чата
 * @param {Array} messages - Массив сообщений
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ success: boolean, chatId: string, count: number, error: string|null }>}
 */
async function createChatWithBatch(userId, chatData, messages, config) {
    try {
        const topic = chatData.topic_id || 'fast';
        validateTopic(topic);
        
        // Проверяем права на синхронизацию
        const canSync = await canUserSync(userId, config);
        if (!canSync) {
            return {
                success: false,
                error: 'Синхронизация недоступна для вашего тарифного плана'
            };
        }
        
        // Создаем чат
        const chatId = chatData.id || crypto.randomUUID();
        
        await supabaseFetch(
            'chats',
            {
                method: 'POST',
                body: JSON.stringify({
                    id: chatId,
                    user_id: userId,
                    topic_id: topic,
                    title: chatData.title || `Чат в разделе ${topic}`,
                    max_context: chatData.max_context || 15,
                    user_renamed: chatData.user_renamed || false,
                })
            },
            config,
            'service'
        );
        
        // Добавляем сообщения
        let savedCount = 0;
        
        if (messages && Array.isArray(messages)) {
            for (const msg of messages) {
                const validation = validateMessageLength(msg.text);
                if (!validation.valid) {
                    continue;
                }
                
                const msgId = msg.id || crypto.randomUUID();
                const msgType = msg.type || 'user-msg';
                
                try {
                    await supabaseFetch(
                        'messages',
                        {
                            method: 'POST',
                            body: JSON.stringify({
                                id: msgId,
                                chat_id: chatId,
                                msg_type: msgType,
                                text: msg.text,
                                is_favorite: msg.is_favorite || false,
                            })
                        },
                        config,
                        'service'
                    );
                    savedCount++;
                } catch (err) {
                    console.error('Failed to save message in batch:', err.message);
                }
            }
        }
        
        return {
            success: true,
            chatId: chatId,
            count: savedCount,
            error: null
        };
    } catch (err) {
        console.error('Create chat with batch error:', err.message);
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
        
        const { action, chatId, topicId, chatTitle, maxContext, userRenamed, messages } = body;
        
        if (action === 'batch_messages') {
            // Добавление batch в существующий чат
            if (!chatId || !messages) {
                return errorResponse('Missing chatId or messages', 400);
            }
            
            const result = await batchAddMessages(userId, chatId, messages, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                synced: true,
                count: result.count,
                chatId: chatId
            });
            
        } else if (action === 'create_chat_batch') {
            // Создание чата с batch сообщениями
            if (!messages) {
                return errorResponse('Missing messages', 400);
            }
            
            const chatData = {
                id: body.chatId || crypto.randomUUID(),
                topic_id: topicId || 'fast',
                title: chatTitle || 'Новый чат',
                max_context: maxContext || 15,
                user_renamed: userRenamed || false
            };
            
            const result = await createChatWithBatch(userId, chatData, messages, config);
            if (!result.success) {
                return errorResponse(result.error, 400);
            }
            
            return jsonResponse({
                success: true,
                chatId: result.chatId,
                count: result.count || 0
            });
            
        } else {
            return errorResponse('Unknown action', 400);
        }
        
    } catch (err) {
        console.error('Batch handler error:', err.message);
        return errorResponse(err.message, 500);
    }
}
