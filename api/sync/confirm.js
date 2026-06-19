// api/sync/confirm.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { isValidUUID } from '../_lib/validate-uuid.js';
import { getSupabaseConfig } from '../_lib/supabase-client.js';

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
                status: 401,
                headers: corsHeaders
            });
        }

        const botToken = process.env.BOT_TOKEN?.trim();
        if (!botToken) {
            return new Response(JSON.stringify({ error: 'Bot token not configured' }), {
                status: 500,
                headers: corsHeaders
            });
        }

        const user = await validateTelegramInitData(initData, botToken);
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid init data' }), {
                status: 401,
                headers: corsHeaders
            });
        }

        const userId = user.id;
        
        // ==========================================
        // ДОБАВЛЕНО: ПРОВЕРКА USER_ID
        // ==========================================
        if (!Number.isInteger(userId) || userId <= 0) {
            return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
                status: 401,
                headers: corsHeaders
            });
        }

        let body;
        try {
            body = await request.json();
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const { id, deviceFingerprint } = body;

        if (!id || !deviceFingerprint) {
            return new Response(JSON.stringify({ error: 'Missing id or deviceFingerprint' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        if (!isValidUUID(id)) {
            return new Response(JSON.stringify({ error: 'Invalid ID format' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const config = getSupabaseConfig();

        async function supabaseFetch(path, options = {}) {
            const url = `${config.url}/rest/v1/${path}`;
            const headers = {
                'apikey': config.key,
                'Authorization': `Bearer ${config.key}`,
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

        // Проверяем, что запись принадлежит пользователю
        const pending = await supabaseFetch(`pending_deletions?id=eq.${id}&user_id=eq.${userId}&select=devices_pending`);
        
        if (!pending || pending.length === 0) {
            return new Response(JSON.stringify({ success: true, alreadyCleaned: true }), {
                status: 200,
                headers: corsHeaders
            });
        }

        const devicesPending = pending[0].devices_pending || [];
        const updatedDevices = devicesPending.filter(fp => fp !== deviceFingerprint);

        if (updatedDevices.length === 0) {
            await supabaseFetch(`pending_deletions?id=eq.${id}`, { method: 'DELETE' });
            return new Response(JSON.stringify({ success: true, cleaned: true }), {
                status: 200,
                headers: corsHeaders
            });
        } else {
            await supabaseFetch(`pending_deletions?id=eq.${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ devices_pending: updatedDevices })
            });
            return new Response(JSON.stringify({ success: true, cleaned: false, remaining: updatedDevices.length }), {
                status: 200,
                headers: corsHeaders
            });
        }

    } catch (err) {
        console.error('Confirm error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
