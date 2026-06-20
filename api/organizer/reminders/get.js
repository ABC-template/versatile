// ============================================
// api/organizer/reminders/get.js
// Описание: Получение напоминаний
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
        
        let query = `reminders?user_id=eq.${userId}&status=eq.pending&order=trigger_at.asc`;
        if (topicId) {
            query += `&topic_id=eq.${topicId}`;
        }
        
        const reminders = await supabaseFetch(
            query,
            { method: 'GET' },
            config,
            'service'
        );
        
        return jsonResponse({
            success: true,
            data: reminders || []
        });
        
    } catch (err) {
        console.error('Get reminders error:', err.message);
        return errorResponse(err.message, 500);
    }
}
