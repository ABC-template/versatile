// api/chats/trash.js
import { validateTelegramInitData } from '../_lib/telegram-auth.js';

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

        // ==========================================
        // GET — получить содержимое корзины
        // ==========================================
        if (request.method === 'GET') {
            // Чаты в корзине
            const deletedChats = await supabaseFetch(`
                chats?user_id=eq.${userId}&deleted_at=not.is.null&select=id,title,topic_id,deleted_at,created_at&order=deleted_at.desc
            `);

            // Сообщения в корзине (только из живых чатов)
            const deletedMessages = await supabaseFetch(`
                messages?user_id=eq.${userId}&deleted_at=not.is.null&select=id,text,chat_id,deleted_at,created_at&order=deleted_at.desc
            `);

            // Для сообщений подтягиваем названия чатов
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

            const { id, type } = body; // type: 'chat' или 'message'

            if (!id || !type) {
                return new Response(JSON.stringify({ error: 'Missing id or type' }), {
                    status: 400,
                    headers: corsHeaders
                });
            }

            if (type === 'chat') {
                // Восстанавливаем чат
                await supabaseFetch(`chats?id=eq.${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ deleted_at: null })
                });
            } else if (type === 'message') {
                // Восстанавливаем сообщение
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
        // DELETE — удаление навсегда (HARD DELETE)
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

            // Получаем список активных устройств
            const devices = await supabaseFetch(`user_devices?user_id=eq.${userId}&is_active=eq.true&select=device_fingerprint`);
            const deviceFingerprints = (devices || []).map(d => d.device_fingerprint).filter(fp => fp !== deviceFingerprint);

            // Создаем pending_deletions
            let entityCreatedAt = null;
            if (type === 'chat') {
                const chat = await supabaseFetch(`chats?id=eq.${id}&select=created_at`);
                entityCreatedAt = chat[0]?.created_at;
                // Удаляем чат
                await supabaseFetch(`chats?id=eq.${id}`, { method: 'DELETE' });
            } else {
                const msg = await supabaseFetch(`messages?id=eq.${id}&select=created_at`);
                entityCreatedAt = msg[0]?.created_at;
                // Удаляем сообщение
                await supabaseFetch(`messages?id=eq.${id}`, { method: 'DELETE' });
            }

            // Создаем запись в pending_deletions если есть другие устройства
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
        console.error('Trash error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
