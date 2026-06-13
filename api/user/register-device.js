// api/user/register-device.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { logSecurityEvent } from '../_lib/security-logger.js';

export const config = { runtime: 'edge' };

// Генерация HMAC подписи для fingerprint
async function signDeviceFingerprint(fingerprint, userId) {
    const secret = process.env.DEVICE_SECRET?.trim();
    if (!secret) {
        throw new Error('DEVICE_SECRET not configured');
    }
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const message = encoder.encode(`${userId}:${fingerprint}`);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export default async function handler(request) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
        const initData = request.headers.get('x-telegram-init-data');
        if (!initData) {
            await logSecurityEvent(null, 'register_device_no_initdata', {}, request);
            return new Response(JSON.stringify({ error: 'Missing init data' }), {
                status: 401, headers: corsHeaders
            });
        }

        const botToken = process.env.BOT_TOKEN?.trim();
        if (!botToken) {
            return new Response(JSON.stringify({ error: 'Bot token not configured' }), {
                status: 500, headers: corsHeaders
            });
        }

        const user = await validateTelegramInitData(initData, botToken);
        if (!user) {
            await logSecurityEvent(null, 'register_device_invalid_token', {}, request);
            return new Response(JSON.stringify({ error: 'Invalid init data' }), {
                status: 401, headers: corsHeaders
            });
        }

        const userId = user.id;
        let body;
        try {
            body = await request.json();
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400, headers: corsHeaders
            });
        }

        const { deviceFingerprint } = body;
        if (!deviceFingerprint) {
            return new Response(JSON.stringify({ error: 'Missing deviceFingerprint' }), {
                status: 400, headers: corsHeaders
            });
        }

        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

        if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
                status: 500, headers: corsHeaders
            });
        }

        async function supabaseFetch(path, options = {}) {
            const url = `${supabaseUrl}/rest/v1/${path}`;
            const headers = {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
            };
            const res = await fetch(url, { ...options, headers });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
            }
            if (res.status === 204 || res.headers.get('content-length') === '0') {
                return { success: true };
            }
            return res.json();
        }

        // Генерируем подписанную версию fingerprint
        let signedFingerprint;
        try {
            signedFingerprint = await signDeviceFingerprint(deviceFingerprint, userId);
        } catch (err) {
            console.error('Failed to sign fingerprint:', err);
            return new Response(JSON.stringify({ error: 'Security configuration error' }), {
                status: 500, headers: corsHeaders
            });
        }

        // Определяем платформу
        const userAgent = request.headers.get('user-agent') || '';
        const platform = userAgent.includes('Android') ? 'android' : 
                         userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'ios' : 'web';

        console.log(`📱 Регистрация устройства: userId=${userId}, platform=${platform}`);

        // Проверяем, существует ли устройство (по ПОДПИСАННОМУ fingerprint)
        const existing = await supabaseFetch(`user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}&select=id`);

        if (existing && existing.length > 0) {
            // Устройство уже есть — обновляем last_seen
            console.log(`🔄 Устройство уже зарегистрировано, обновляем last_seen`);
            await supabaseFetch(`user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}`, {
                method: 'PATCH',
                body: JSON.stringify({ 
                    last_seen: new Date().toISOString(),
                    is_active: true
                })
            });
            return new Response(JSON.stringify({
                success: true,
                isNew: false,
                signedFingerprint: signedFingerprint // Возвращаем подписанную версию для клиента
            }), { status: 200, headers: corsHeaders });
        } else {
            // Новое устройство
            console.log(`🆕 Регистрируем новое устройство для пользователя ${userId}`);
            await supabaseFetch('user_devices', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    device_fingerprint: signedFingerprint, // Сохраняем подписанную версию!
                    raw_fingerprint: deviceFingerprint,    // Сохраняем оригинал для отладки
                    platform: platform,
                    is_active: true,
                    last_seen: new Date().toISOString(),
                    created_at: new Date().toISOString()
                })
            });
            console.log(`✅ Устройство зарегистрировано`);
            return new Response(JSON.stringify({
                success: true,
                isNew: true,
                signedFingerprint: signedFingerprint
            }), { status: 200, headers: corsHeaders });
        }

    } catch (err) {
        console.error('Register device error:', err);
        await logSecurityEvent(null, 'register_device_exception', { error: err.message }, request);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: corsHeaders
        });
    }
}
