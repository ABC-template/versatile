// ============================================
// api/sync/confirm.js
// Описание: Подтверждение удаления на устройстве
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';
import { isValidUUID, validateUUID } from '../_lib/validators.js';

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
        
        const { id, deviceFingerprint } = body;
        
        if (!id || !deviceFingerprint) {
            return errorResponse('Missing id or deviceFingerprint', 400);
        }
        
        validateUUID(id, 'Pending ID');
        
        // Проверяем, что запись принадлежит пользователю
        const pending = await supabaseFetch(
            `pending_deletions?id=eq.${id}&user_id=eq.${userId}&select=id,is_cleaned`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!pending || !Array.isArray(pending) || pending.length === 0) {
            return jsonResponse({ success: true, alreadyCleaned: true });
        }
        
        if (pending[0].is_cleaned) {
            return jsonResponse({ success: true, alreadyCleaned: true });
        }
        
        // Удаляем устройство из списка pending
        await supabaseFetch(
            `pending_deletion_devices?pending_id=eq.${id}&device_fingerprint=eq.${deviceFingerprint}`,
            { method: 'DELETE' },
            config,
            'service'
        );
        
        // Проверяем, остались ли еще устройства
        const remaining = await supabaseFetch(
            `pending_deletion_devices?pending_id=eq.${id}&select=device_fingerprint`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!remaining || !Array.isArray(remaining) || remaining.length === 0) {
            // Помечаем как очищенное
            await supabaseFetch(
                `pending_deletions?id=eq.${id}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ is_cleaned: true })
                },
                config,
                'service'
            );
            
            return jsonResponse({ success: true, cleaned: true });
        }
        
        return jsonResponse({
            success: true,
            cleaned: false,
            remaining: remaining.length
        });
        
    } catch (err) {
        console.error('Confirm error:', err.message);
        return errorResponse(err.message, 500);
    }
}
