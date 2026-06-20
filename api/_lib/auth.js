// ============================================
// api/_lib/auth.js
// Описание: Единая аутентификация для всех Edge-функций
// ============================================

import { getSupabaseConfig, setAppUserContext } from './supabase-client.js';

/**
 * Валидация Telegram Init Data
 * @param {string} initData - Telegram initData
 * @param {string} botToken - Токен бота
 * @returns {Promise<object|null>} - Объект пользователя или null
 */
async function validateTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        if (!hash) return null;
        urlParams.delete('hash');
        
        const sortedKeys = [...urlParams.keys()].sort();
        const dataCheckString = sortedKeys
            .map(key => `${key}=${urlParams.get(key)}`)
            .join('\n');
        
        const encoder = new TextEncoder();
        
        // В Telegram используется HMAC-SHA256 с константой "WebAppData"
        const baseKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode("WebAppData"),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        
        const secretKeyBuffer = await crypto.subtle.sign(
            "HMAC",
            baseKey,
            encoder.encode(botToken)
        );
        
        const secretKey = await crypto.subtle.importKey(
            "raw",
            secretKeyBuffer,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        
        const calculatedHashBuffer = await crypto.subtle.sign(
            "HMAC",
            secretKey,
            encoder.encode(dataCheckString)
        );
        
        const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        if (calculatedHash !== hash) return null;
        
        const user = JSON.parse(urlParams.get('user') || '{}');
        return user.id ? user : null;
    } catch (e) {
        console.error('Telegram auth error:', e.message);
        return null;
    }
}

/**
 * Аутентифицировать запрос
 * @param {Request} request - Request объект
 * @param {boolean} requireUser - Требовать ли пользователя (по умолчанию true)
 * @returns {Promise<{ user: object|null, userId: number|null, error: string|null }>}
 */
export async function authenticate(request, requireUser = true) {
    try {
        const initData = request.headers.get('x-telegram-init-data');
        if (!initData) {
            return { 
                user: null, 
                userId: null, 
                error: 'Missing init data',
                status: 401
            };
        }
        
        const botToken = process.env.BOT_TOKEN?.trim();
        if (!botToken) {
            return { 
                user: null, 
                userId: null, 
                error: 'Bot token not configured',
                status: 500
            };
        }
        
        const user = await validateTelegramInitData(initData, botToken);
        if (!user || !user.id) {
            return { 
                user: null, 
                userId: null, 
                error: 'Invalid init data',
                status: 401
            };
        }
        
        const userId = parseInt(user.id, 10);
        if (!Number.isInteger(userId) || userId <= 0) {
            return { 
                user: null, 
                userId: null, 
                error: 'Invalid user ID',
                status: 401
            };
        }
        
        // Устанавливаем контекст для RLS
        try {
            const config = getSupabaseConfig('service');
            await setAppUserContext(userId, config);
        } catch (err) {
            console.error('Failed to set user context:', err.message);
            // Не блокируем запрос, если не удалось установить контекст
        }
        
        return { user, userId, error: null };
    } catch (err) {
        console.error('Authentication error:', err.message);
        return { 
            user: null, 
            userId: null, 
            error: err.message,
            status: 500
        };
    }
}

/**
 * Проверить, является ли пользователь администратором
 * @param {number} userId - ID пользователя
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
    try {
        const config = getSupabaseConfig('service');
        const result = await supabaseFetch(
            `users?telegram_id=eq.${userId}&select=role`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (!result || !Array.isArray(result) || result.length === 0) {
            return false;
        }
        
        const user = result[0];
        return ['admin', 'creator'].includes(user.role);
    } catch (err) {
        console.error('Failed to check admin status:', err.message);
        return false;
    }
}

/**
 * Проверить, является ли пользователь создателем (владельцем)
 * @param {number} userId - ID пользователя
 * @param {number} creatorId - ID создателя (обычно 1541531808)
 * @returns {boolean}
 */
export function isCreator(userId, creatorId = 1541531808) {
    return userId === creatorId;
}
