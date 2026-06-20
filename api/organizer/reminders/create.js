// ============================================
// api/organizer/reminders/create.js
// Описание: Создание напоминания
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
        
        const { topicId, taskText, triggerAt } = body;
        
        if (!topicId || !taskText || !triggerAt) {
            return errorResponse('Missing topicId, taskText or triggerAt', 400);
        }
        
        validateTopic(topicId);
        
        if (taskText.length > 500) {
            return errorResponse('Task text too long (max 500 characters)', 400);
        }
        
        // Проверяем, что время не в прошлом
        const triggerDate = new Date(triggerAt);
        if (triggerDate <= new Date()) {
            return errorResponse('Trigger time must be in the future', 400);
        }
        
        const result = await supabaseFetch(
            'reminders',
            {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    topic_id: topicId,
                    task_text: taskText,
                    trigger_at: triggerAt,
                    status: 'pending'
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
        console.error('Create reminder error:', err.message);
        return errorResponse(err.message, 500);
    }
}
