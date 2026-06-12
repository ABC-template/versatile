// api/user/register-device.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

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

        // Проверяем, существует ли устройство
        const existing = await supabaseFetch(`user_devices?device_fingerprint=eq.${encodeURIComponent(deviceFingerprint)}&select=id`);

        if (existing && existing.length > 0) {
            // Устройство уже есть
            return new Response(JSON.stringify({
                success: true,
                isNew: false
            }), { status: 200, headers: corsHeaders });
        } else {
            // Новое устройство
            await supabaseFetch('user_devices', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    device_fingerprint: deviceFingerprint,
                    is_active: true
                })
            });
            return new Response(JSON.stringify({
                success: true,
                isNew: true
            }), { status: 200, headers: corsHeaders });
        }

    } catch (err) {
        console.error('Register device error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: corsHeaders
        });
    }
}
