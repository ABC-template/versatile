// ============================================
// api/users/stats.js
// Описание: Получение статистики пользователя
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseRPC } from '../_lib/supabase-client.js';

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
        
        const stats = await supabaseRPC('get_user_stats', { uid: userId }, config, 'service');
        
        return jsonResponse({
            success: true,
            stats: stats || { total_chats: 0, total_messages: 0, total_favorites: 0 }
        });
        
    } catch (err) {
        console.error('Stats error:', err.message);
        return errorResponse(err.message, 500);
    }
}
