// api/chats/trash.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';
import { isValidUUID, validateChatId, validateMessageId } from '../_lib/validate-uuid.js';
import { getSupabaseConfig } from '../_lib/supabase-client.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
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

        // ==========================================
        // GET — получить содержимое корзины
        // ==========================================
        if (request.method === 'GET') {
            const deletedChats = await supabaseFetch(`
                chats?user_id=eq.${userId}&deleted_at=not.is.null&select=id,title,topic_id,deleted_at,created_at&order=deleted_at.desc
            `);

            const deletedMessages = await supabaseFetch(`
                messages?user_id=eq.${userId}&deleted_at=not.is.null&select=id,text,chat_id,deleted_at,created_at&order=deleted_at.desc
            `);

            const messagesWithChats = await Promise.all((deletedMessages || []).map(async (msg) => {
                const chat = await supabaseFetch(`chats?id=eq.${msg.chat_id}&select=title`);
                return {
                    ...msg,
                    chat_title: chat[0]?.title || 'Unknown'
                };
            }));

            return new Response(JSON.stringify({
                success: true,
                chats: deletedChats || [],
                messages: messagesWithChats || []
            }), { status: 200, headers: corsHeaders });
        }

        // ==========================================
        // POST — восстановление из корзины
        // ==========================================
        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                    status: 400,
                    headers: corsHeaders
                });
            }

            const { id, type } = body;

            if (!id || !type) {
                return new Response(JSON.stringify({ error: 'Missing id or type' }), {
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

            if (type === 'chat') {
                await supabaseFetch(`chats?id=eq.${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ deleted_at: null })
                });
            } else if (type === 'message') {
                await supabaseFetch(`messages?id=eq.${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ deleted_at: null })
                });
            } else {
                return new Response(JSON.stringify({ error: 'Invalid type' }), {
                    status: 400,
                    headers: corsHeaders
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: corsHeaders
            });
        }

        // ==========================================
        // DELETE — удаление навсегда
        // ==========================================
        if (request.method === 'DELETE') {
            let body;
            try {
                body = await request.json();
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                    status: 400,
                    headers: corsHeaders
                });
            }

            const { id, type, deviceFingerprint } = body;

            if (!id || !type || !deviceFingerprint) {
                return new Response(JSON.stringify({ error: 'Missing id, type or deviceFingerprint' }), {
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

            const devices = await supabaseFetch(`user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`);
            const deviceFingerprints = (devices || []).map(d => d.device_fingerprint).filter(fp => fp !== deviceFingerprint);

            let entityCreatedAt = null;
            if (type === 'chat') {
                const chat = await supabaseFetch(`chats?id=eq.${id}&select=created_at`);
                entityCreatedAt = chat[0]?.created_at;
                await supabaseFetch(`chats?id=eq.${id}`, { method: 'DELETE' });
            } else {
                const msg = await supabaseFetch(`messages?id=eq.${id}&select=created_at`);
                entityCreatedAt = msg[0]?.created_at;
                await supabaseFetch(`messages?id=eq.${id}`, { method: 'DELETE' });
            }

            if (deviceFingerprints.length > 0) {
                await supabaseFetch('pending_deletions', {
                    method: 'POST',
                    body: JSON.stringify({
                        id: id,
                        entity_type: type,
                        user_id: userId,
                        entity_created_at: entityCreatedAt,
                        devices_pending: deviceFingerprints
                    })
                });
            }

            return new Response(JSON.stringify({
                success: true,
                pendingDevices: deviceFingerprints.length
            }), { status: 200, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: corsHeaders
        });

    } catch (err) {
        console.error('Trash error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
