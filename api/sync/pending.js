// api/sync/pending.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
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
        const url = new URL(request.url);
        const deviceFingerprint = url.searchParams.get('device');

        if (!deviceFingerprint) {
            return new Response(JSON.stringify({ error: 'Missing device fingerprint' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

        if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
                status: 500,
                headers: corsHeaders
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

        // Получаем все pending записи для этого устройства
        const pending = await supabaseFetch(`pending_deletions?user_id=eq.${userId}&devices_pending=cs.${JSON.stringify([deviceFingerprint])}&select=id,entity_type,parent_id`);

        return new Response(JSON.stringify({
            success: true,
            pending: pending || []
        }), { status: 200, headers: corsHeaders });

    } catch (err) {
        console.error('Get pending error:', err);
        return new Response(JSON.stringify({ error: err.message, pending: [] }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
