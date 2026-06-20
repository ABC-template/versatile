// ============================================
// api/auth/check.js
// Описание: Проверка подписки и авторизации
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
    // Обработка CORS
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;
    
    if (request.method !== 'GET') {
        return errorResponse('Method Not Allowed', 405);
    }
    
    try {
        // Аутентификация
        const auth = await authenticate(request);
        if (auth.error) {
            return errorResponse(auth.error, auth.status || 401);
        }
        
        const userId = auth.userId;
        const user = auth.user;
        
        // Получаем конфигурацию Supabase (используем SERVICE для проверки)
        const config = getSupabaseConfig('service');
        
        // Проверяем/создаем пользователя
        let dbUser = null;
        try {
            const userRes = await supabaseFetch(
                `users?telegram_id=eq.${userId}&select=telegram_id,role,premium_until,username`,
                { method: 'GET' },
                config,
                'service'
            );
            
            if (userRes && Array.isArray(userRes) && userRes.length > 0) {
                dbUser = userRes[0];
                console.log(`👤 Пользователь ${userId} уже существует`);
            } else {
                // Создаем нового пользователя
                console.log(`🆕 Создаём нового пользователя: ${userId}`);
                
                await supabaseFetch(
                    'users',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            telegram_id: userId,
                            username: user.username || null,
                            role: 'trial',
                            user_lang: user.language_code || 'ru',
                        })
                    },
                    config,
                    'service'
                );
                
                dbUser = { role: 'trial' };
                console.log(`✅ Пользователь ${userId} создан`);
            }
        } catch (err) {
            console.error('Error checking/creating user:', err.message);
            dbUser = { role: 'trial' };
        }
        
        // Определяем роль и лимиты
        let role = 'guest';
        let dailyLimit = 0;
        let syncEnabled = false;
        
        // Проверяем роль в БД
        if (dbUser) {
            if (['admin', 'creator'].includes(dbUser.role)) {
                role = dbUser.role;
                dailyLimit = 9999;
                syncEnabled = true;
            } else if (dbUser.role === 'premium' && dbUser.premium_until && new Date(dbUser.premium_until) > new Date()) {
                role = 'premium';
                dailyLimit = 100;
                syncEnabled = true;
            }
        }
        
        // Если не админ и не премиум, проверяем подписку в канале
        if (!['admin', 'creator', 'premium'].includes(role)) {
            const channelId = process.env.CHANNEL_ID?.trim();
            const botToken = process.env.BOT_TOKEN?.trim();
            
            if (channelId && botToken) {
                try {
                    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${userId}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    
                    if (data.ok) {
                        const status = data.result.status;
                        const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
                        
                        if (['administrator', 'creator'].includes(status)) {
                            role = 'admin';
                            dailyLimit = 9999;
                            syncEnabled = true;
                        } else if (isMember) {
                            role = 'trial';
                            dailyLimit = 5;
                            syncEnabled = false;
                        }
                    }
                } catch (err) {
                    console.error('Error checking channel membership:', err.message);
                }
            }
        }
        
        // Ответ
        return jsonResponse({
            isMember: role !== 'guest',
            role,
            dailyLimit,
            syncEnabled,
            serverModels: { 
                gemini: true, 
                deepseek: true, 
                gpt: true, 
                claude: true, 
                grok: true 
            },
            userId
        });
        
    } catch (err) {
        console.error('Check auth error:', err.message);
        return errorResponse(err.message, 500);
    }
}
