// ============================================
// api/_lib/rate-limit.js
// Описание: Проверка лимитов для Edge-функций
// ============================================

import { checkUsageLimit, incrementUsage } from './supabase-client.js';

/**
 * Проверить и инкрементировать лимит
 * @param {number} userId - ID пользователя
 * @param {boolean} shouldIncrement - Инкрементировать ли счетчик
 * @param {object} config - Конфигурация Supabase
 * @returns {Promise<{ allowed: boolean, used: number, limit: number, error: string|null }>}
 */
export async function checkRateLimit(userId, shouldIncrement = true, config = null) {
    if (!userId) {
        return { 
            allowed: false, 
            used: 0, 
            limit: 0, 
            error: 'User ID required' 
        };
    }
    
    try {
        // Проверяем текущий лимит
        const limitCheck = await checkUsageLimit(userId, config);
        
        if (!limitCheck.allowed) {
            return {
                allowed: false,
                used: limitCheck.used,
                limit: limitCheck.limit,
                error: `Daily limit exceeded (${limitCheck.used}/${limitCheck.limit})`
            };
        }
        
        // Если нужно, инкрементируем счетчик
        if (shouldIncrement) {
            await incrementUsage(userId, config);
        }
        
        return {
            allowed: true,
            used: limitCheck.used,
            limit: limitCheck.limit,
            error: null
        };
    } catch (err) {
        console.error('Rate limit check failed:', err.message);
        // В случае ошибки пропускаем (fail open)
        return {
            allowed: true,
            used: 0,
            limit: 9999,
            error: null
        };
    }
}

/**
 * Создать заголовки для rate limit
 * @param {number} used - Использовано
 * @param {number} limit - Лимит
 * @param {number} reset - Время сброса (timestamp)
 * @returns {object}
 */
export function getRateLimitHeaders(used, limit, reset = null) {
    const remaining = Math.max(0, limit - used);
    return {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Used': used.toString(),
        ...(reset ? { 'X-RateLimit-Reset': reset.toString() } : {})
    };
}
