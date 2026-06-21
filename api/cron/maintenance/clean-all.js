// ============================================
// api/cron/maintenance/clean-all.js
// Описание: Объединенная очистка (корзина + логи + usage + pending)
// ============================================

import { getSupabaseConfig, supabaseFetch, supabaseRPC } from '../../_lib/supabase-client.js';

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
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    try {
        console.log('🧹 Начинаем общую очистку...');
        
        // ==========================================
        // 1. ОЧИСТКА КОРЗИНЫ (30 дней)
        // ==========================================
        console.log('🗑️ Очистка корзины (чаты > 30 дней)...');
        let trashCleaned = 0;
        
        try {
            // Находим чаты в корзине старше 30 дней
            const expiredTrash = await supabaseFetch(
                `chats?deleted_at=lt.${encodeURIComponent(thirtyDaysAgo)}&select=id`,
                { method: 'GET' },
                config,
                'service'
            );
            
            if (expiredTrash && Array.isArray(expiredTrash) && expiredTrash.length > 0) {
                for (const chat of expiredTrash) {
                    try {
                        // Удаляем сообщения
                        await supabaseFetch(
                            `messages?chat_id=eq.${chat.id}`,
                            { method: 'DELETE' },
                            config,
                            'service'
                        );
                        
                        // Удаляем чат
                        await supabaseFetch(
                            `chats?id=eq.${chat.id}`,
                            { method: 'DELETE' },
                            config,
                            'service'
                        );
                        
                        trashCleaned++;
                    } catch (err) {
                        console.error(`Ошибка удаления чата ${chat.id}:`, err.message);
                    }
                }
            }
            console.log(`✅ Очищено ${trashCleaned} чатов из корзины`);
        } catch (err) {
            console.error('Ошибка очистки корзины:', err.message);
        }
        
        // ==========================================
        // 2. ОЧИСТКА ЛОГОВ БЕЗОПАСНОСТИ (30 дней)
        // ==========================================
        console.log('📋 Очистка логов безопасности (> 30 дней)...');
        let logsDeleted = 0;
        
        try {
            const result = await supabaseRPC('clean_old_security_logs', {}, config, 'service');
            logsDeleted = result || 0;
            console.log(`✅ Удалено ${logsDeleted} логов безопасности`);
        } catch (err) {
            console.error('Ошибка очистки логов безопасности:', err.message);
        }
        
        // ==========================================
        // 3. ОЧИСТКА СТАРЫХ ЗАПИСЕЙ USAGE (90 дней)
        // ==========================================
        console.log('📊 Очистка старых записей usage (> 90 дней)...');
        let usageDeleted = 0;
        
        try {
            const result = await supabaseRPC('clean_old_usage', {}, config, 'service');
            usageDeleted = result || 0;
            console.log(`✅ Удалено ${usageDeleted} записей usage`);
        } catch (err) {
            console.error('Ошибка очистки usage:', err.message);
        }
        
        // ==========================================
        // 4. ОЧИСТКА СТАРЫХ PENDING DELETIONS (30 дней)
        // ==========================================
        console.log('⏳ Очистка старых pending_deletions (> 30 дней)...');
        let pendingDeleted = 0;
        
        try {
            const result = await supabaseRPC('clean_old_pending_deletions', {}, config, 'service');
            pendingDeleted = result || 0;
            console.log(`✅ Очищено ${pendingDeleted} записей pending_deletions`);
        } catch (err) {
            console.error('Ошибка очистки pending_deletions:', err.message);
        }
        
        // ==========================================
        // 5. ОЧИСТКА СТАРЫХ УВЕДОМЛЕНИЙ (60 дней)
        // ==========================================
        console.log('🔔 Очистка старых уведомлений (> 60 дней)...');
        let notificationsDeleted = 0;
        
        try {
            const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const result = await supabaseFetch(
                `premium_notifications?notified_at=lt.${encodeURIComponent(sixtyDaysAgo)}`,
                { method: 'DELETE' },
                config,
                'service'
            );
            notificationsDeleted = result?.success ? 1 : 0; // Примерно
            console.log(`✅ Удалены старые уведомления`);
        } catch (err) {
            console.error('Ошибка очистки уведомлений:', err.message);
        }
        
        // ==========================================
        // 6. ОТВЕТ
        // ==========================================
        
        const report = {
            success: true,
            timestamp: now.toISOString(),
            trash_cleaned: trashCleaned,
            security_logs_deleted: logsDeleted,
            usage_records_deleted: usageDeleted,
            pending_deletions_cleaned: pendingDeleted,
            notifications_cleaned: notificationsDeleted
        };
        
        console.log('✅ Общая очистка завершена:', JSON.stringify(report));
        
        return new Response(JSON.stringify(report), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (err) {
        console.error('Clean all error:', err.message);
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
