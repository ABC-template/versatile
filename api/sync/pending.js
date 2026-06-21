// ============================================
// api/sync/pending.js
// Описание: Получение списка pending удалений для устройства
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';

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
        
        const url = new URL(request.url);
        const deviceFingerprint = url.searchParams.get('device');
        
        if (!deviceFingerprint) {
            return errorResponse('Missing device fingerprint', 400);
        }
        
        // Получаем все pending записи пользователя
        const allPending = await supabaseFetch(
            `pending_deletions?user_id=eq.${userId}&select=id,entity_type,parent_id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        // Фильтруем по устройствам
        const pending = [];
        
        for (const item of (allPending || [])) {
            const devices = await supabaseFetch(
                `pending_deletion_devices?pending_id=eq.${item.id}&select=device_fingerprint`,
                { method: 'GET' },
                config,
                'service'
            );
            
            const deviceFingerprints = (devices || []).map(d => d.device_fingerprint);
            
            if (deviceFingerprints.includes(deviceFingerprint)) {
                pending.push(item);
            }
        }
        
        return jsonResponse({
            success: true,
            pending: pending
        });
        
    } catch (err) {
        console.error('Get pending error:', err.message);
        return jsonResponse({
            error: err.message,
            pending: []
        }, 500);
    }
}
