// ============================================
// api/organizer/reminders/delete.js
// Описание: Удаление напоминания
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
            return errorResponse('Missing reminder id', 400);
        }
        
        validateUUID(id, 'Reminder ID');
        
        // Проверяем, что напоминание принадлежит пользователю
        const check = await supabaseFetch(
            `reminders?id=eq.${id}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!check || !Array.isArray(check) || check.length === 0) {
            return errorResponse('Reminder not found or access denied', 404);
        }
        
        await supabaseFetch(
            `reminders?id=eq.${id}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        return jsonResponse({ success: true });
        
    } catch (err) {
        console.error('Delete reminder error:', err.message);
        return errorResponse(err.message, 500);
    }
}
