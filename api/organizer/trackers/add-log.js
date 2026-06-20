// ============================================
// api/organizer/trackers/add-log.js
// Описание: Добавление лога в трекер
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
        
        const { trackerId, value, noteText, loggedDate } = body;
        
        if (!trackerId || !value) {
            return errorResponse('Missing trackerId or value', 400);
        }
        
        validateUUID(trackerId, 'Tracker ID');
        
        if (value.length > 100) {
            return errorResponse('Value too long (max 100 characters)', 400);
        }
        
        if (noteText && noteText.length > 500) {
            return errorResponse('Note too long (max 500 characters)', 400);
        }
        
        // Проверяем, что трекер принадлежит пользователю
        const check = await supabaseFetch(
            `trackers?id=eq.${trackerId}&user_id=eq.${userId}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!check || !Array.isArray(check) || check.length === 0) {
            return errorResponse('Tracker not found or access denied', 404);
        }
        
        const result = await supabaseFetch(
            'tracker_logs',
            {
                method: 'POST',
                body: JSON.stringify({
                    tracker_id: trackerId,
                    value: value,
                    note_text: noteText || null,
                    logged_date: loggedDate || new Date().toISOString()
                })
            },
            config,
            'service'
        );
        
        return jsonResponse({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('Add log error:', err.message);
        return errorResponse(err.message, 500);
    }
}
