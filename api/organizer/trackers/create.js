// ============================================
// api/organizer/trackers/create.js
// Описание: Создание трекера
// ============================================

import { authenticate } from '../../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';
import { isValidTopic, validateTopic } from '../../_lib/validators.js';

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
        
        const { topicId, title, settings = {} } = body;
        
        if (!topicId || !title) {
            return errorResponse('Missing topicId or title', 400);
        }
        
        validateTopic(topicId);
        
        if (title.length > 100) {
            return errorResponse('Title too long (max 100 characters)', 400);
        }
        
        const result = await supabaseFetch(
            'trackers',
            {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    topic_id: topicId,
                    title: title,
                    settings: typeof settings === 'string' ? JSON.parse(settings) : settings,
                    status: 'active'
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
        console.error('Create tracker error:', err.message);
        return errorResponse(err.message, 500);
    }
}
