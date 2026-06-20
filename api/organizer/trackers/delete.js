// ============================================
// api/organizer/trackers/delete.js
// Описание: Удаление трекера со всеми логами
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
            return errorResponse('Missing tracker id', 400);
        }
        
        validateUUID(id, 'Tracker ID');
        
        // Проверяем, что трекер принадлежит пользователю
        const check = await supabaseFetch(
            `trackers?id=eq.${id}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!check || !Array.isArray(check) || check.length === 0) {
            return errorResponse('Tracker not found or access denied', 404);
        }
        
        // Удаляем все логи
        await supabaseFetch(
            `tracker_logs?tracker_id=eq.${id}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        // Удаляем трекер
        await supabaseFetch(
            `trackers?id=eq.${id}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        return jsonResponse({ success: true });
        
    } catch (err) {
        console.error('Delete tracker error:', err.message);
        return errorResponse(err.message, 500);
    }
}
