// ============================================
// api/chats/sync-metadata.js
// Описание: Получение метаданных чатов для синхронизации
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch, canUserSync } from '../_lib/supabase-client.js';

export const config = { runtime: 'edge' };

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
        
        // Проверяем права на синхронизацию
        const syncEnabled = await canUserSync(userId, config);
        
        if (!syncEnabled) {
            return jsonResponse({
                syncEnabled: false,
                message: 'Sync not allowed - insufficient privileges',
                chats: [],
                favorites: []
            });
        }
        
        // Получаем часы
        const chats = await supabaseFetch(
            `chats?user_id=eq.${userId}&deleted_at=is.null&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at&order=updated_at.desc`,
            { method: 'GET' },
            config,
            'service'
        );
        
        // Получаем избранные сообщения
        let favorites = [];
        if (chats && Array.isArray(chats) && chats.length > 0) {
            const chatIds = chats.map(c => c.id).join(',');
            
            favorites = await supabaseFetch(
                `messages?is_favorite=eq.true&chat_id=in.(${chatIds})&deleted_at=is.null&select=id,chat_id,text,is_favorite,updated_at&order=updated_at.desc`,
                { method: 'GET' },
                config,
                'service'
            );
            
            // Форматируем для клиента
            favorites = (favorites || []).map(m => ({
                msg_id: m.id,
                chat_id: m.chat_id,
                text_preview: (m.text || '').substring(0, 100),
                updated_at: m.updated_at
            }));
        }
        
        return jsonResponse({
            syncEnabled: true,
            chats: chats || [],
            favorites: favorites || []
        });
        
    } catch (err) {
        console.error('Sync metadata error:', err.message);
        return jsonResponse({
            error: err.message,
            syncEnabled: false,
            chats: [],
            favorites: []
        }, 500);
    }
}
