// ============================================
// api/cron/premium/check-expiry.js
// Описание: Проверка истекающих подписок
// ============================================

import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET?.trim();
    
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const config = getSupabaseConfig('service');
    
    try {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const toDate = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
        
        // Находим пользователей с истекающей подпиской
        const users = await supabaseFetch(
            `users?role=eq.premium&premium_until=gte.${fromDate}&premium_until=lte.${toDate}&select=telegram_id,premium_until,role`,
            { method: 'GET' },
            config,
            'service'
        );
        
        const expiringUsers = [];
        
        for (const user of (users || [])) {
            const expiry = new Date(user.premium_until);
            const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            
            if (daysLeft < 0 || daysLeft > 5) continue;
            
            // Проверяем, не отправляли ли уже уведомление сегодня
            const notifs = await supabaseFetch(
                `premium_notifications?user_id=eq.${user.telegram_id}&notified_at=eq.${today}&select=notified_at`,
                { method: 'GET' },
                config,
                'service'
            );
            
            if (notifs && Array.isArray(notifs) && notifs.length > 0) continue;
            
            expiringUsers.push({
                user_id: user.telegram_id,
                days_left: daysLeft,
                premium_until: user.premium_until
            });
        }
        
        return new Response(JSON.stringify({
            success: true,
            timestamp: now.toISOString(),
            expiring_users: expiringUsers,
            count: expiringUsers.length
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (err) {
        console.error('Check expiry error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
