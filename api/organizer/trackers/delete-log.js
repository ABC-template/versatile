// ============================================
// api/organizer/trackers/delete-log.js
// Описание: Удаление лога из трекера
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../../_lib/validators.js';

export const config = { runtime: 'edge' };

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
        
        const { id } = body;
        
        if (!id) {
            return errorResponse('Missing log id', 400);
        }
        
        validateUUID(id, 'Log ID');
        
        // Проверяем, что лог принадлежит пользователю через трекер
        const check = await supabaseFetch(
            `tracker_logs?id=eq.${id}&select=tracker_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!check || !Array.isArray(check) || check.length === 0) {
            return errorResponse('Log not found', 404);
        }
        
        const trackerId = check[0].tracker_id;
        
        const trackerCheck = await supabaseFetch(
            `trackers?id=eq.${trackerId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!trackerCheck || !Array.isArray(trackerCheck) || trackerCheck.length === 0) {
            return errorResponse('Access denied', 403);
        }
        
        await supabaseFetch(
            `tracker_logs?id=eq.${id}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        return jsonResponse({ success: true });
        
    } catch (err) {
        console.error('Delete log error:', err.message);
        return errorResponse(err.message, 500);
    }
}
