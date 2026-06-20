// ============================================
// api/users/register-device.js
// Описание: Регистрация устройства пользователя
// ============================================

import { authenticate } from '../_lib/auth.js';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors.js';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client.js';
import { logSecurityEvent } from '../_lib/security-logger.js';

export const config = { runtime: 'edge' };

/**
 * Генерация HMAC подписи для fingerprint
 */
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
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;
    
    if (request.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }
    
    try {
        const auth = await authenticate(request);
        if (auth.error) {
            await logSecurityEvent(null, 'register_device_invalid_token', {}, request);
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
        
        const { deviceFingerprint } = body;
        if (!deviceFingerprint) {
            return errorResponse('Missing deviceFingerprint', 400);
        }
        
        // Генерируем подписанную версию fingerprint
        let signedFingerprint;
        try {
            signedFingerprint = await signDeviceFingerprint(deviceFingerprint, userId);
        } catch (err) {
            console.error('Failed to sign fingerprint:', err);
            return errorResponse('Security configuration error', 500);
        }
        
        const userAgent = request.headers.get('user-agent') || '';
        const platform = userAgent.includes('Android') ? 'android' : 
                         userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'ios' : 'web';
        
        console.log(`📱 Регистрация устройства: userId=${userId}, platform=${platform}`);
        
        // Проверяем по ПОДПИСАННОМУ fingerprint
        const existing = await supabaseFetch(
            `user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}&select=id`,
            { method: 'GET' },
            config,
            'service'
        );
        
        if (existing && Array.isArray(existing) && existing.length > 0) {
            // Обновляем существующее устройство
            await supabaseFetch(
                `user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        last_seen: new Date().toISOString(),
                        is_active: true
                    })
                },
                config,
                'service'
            );
            
            await logSecurityEvent(userId, 'device_updated', { platform }, request);
            
            return jsonResponse({
                success: true,
                isNew: false,
                signedFingerprint: signedFingerprint
            });
            
        } else {
            // Создаем новое устройство
            await supabaseFetch(
                'user_devices',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId,
                        device_fingerprint: signedFingerprint,
                        raw_fingerprint: deviceFingerprint,
                        platform: platform,
                        is_active: true,
                        last_seen: new Date().toISOString()
                    })
                },
                config,
                'service'
            );
            
            console.log(`✅ Устройство зарегистрировано`);
            await logSecurityEvent(userId, 'device_registered', { platform }, request);
            
            return jsonResponse({
                success: true,
                isNew: true,
                signedFingerprint: signedFingerprint
            });
        }
        
    } catch (err) {
        console.error('Register device error:', err.message);
        await logSecurityEvent(null, 'register_device_exception', { error: err.message }, request);
        return errorResponse(err.message, 500);
    }
}
