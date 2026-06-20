// ============================================
// api/organizer/trackers/get.js
// Описание: Получение трекеров и их логов
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';

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
        
        const { searchParams } = new URL(request.url);
        const topicId = searchParams.get('topicId');
        
        // Получаем трекеры
        let query = `trackers?user_id=eq.${userId}&status=eq.active&order=created_at.desc`;
        if (topicId) {
            query += `&topic_id=eq.${topicId}`;
        }
        
        const trackers = await supabaseFetch(
            query,
            { method: 'GET' },
            config,
            'service'
        );
        
        // Получаем логи для трекеров
        let logs = [];
        if (trackers && Array.isArray(trackers) && trackers.length > 0) {
            const trackerIds = trackers.map(t => t.id).join(',');
            
            logs = await supabaseFetch(
                `tracker_logs?tracker_id=in.(${trackerIds})&order=logged_date.desc`,
                { method: 'GET' },
                config,
                'service'
            );
        }
        
        return jsonResponse({
            success: true,
            data: {
                trackers: trackers || [],
                logs: logs || []
            }
        });
        
    } catch (err) {
        console.error('Get trackers error:', err.message);
        return errorResponse(err.message, 500);
    }
}
