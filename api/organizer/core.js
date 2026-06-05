// api/organizer/core.js

export const config = { runtime: 'edge' };

// Вспомогательный хелпер для выполнения молниеносных REST-запросов к Supabase
async function querySupabaseApi(endpoint, method, apiKey, body = null) {
    const options = {
        method: method,
        headers: {
            'apikey': apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation' // Просит базу сразу вернуть созданную/измененную строку
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(endpoint, options);
    return response.json();
}

export default async function handler(request) {
    // Читаем системные ключи подключения к твоему проекту Supabase из Vercel Env
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    // Единый CORS-конфиг для TMA (Telegram Mini Apps)
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ success: false, error: 'Переменные SUPABASE_URL или KEY не настроены в Vercel.' }), {
            status: 500, headers: corsHeaders
        });
    }

    const { searchParams } = new URL(request.url);
    const method = request.method;

    try {
        // ==========================================
        // 1. ОБРАБОТКА GET-ЗАПРОСОВ (ВЫГРУЗКА ИЗ ОБЛАКА)
        // ==========================================
        if (method === 'GET') {
            const action = searchParams.get('action');
            const userId = searchParams.get('userId');

            if (!userId) {
                return new Response(JSON.stringify({ success: false, error: 'Missing userId parameter' }), { status: 400, headers: corsHeaders });
            }

            // Выгрузка пуш-напоминаний для вкладки Scheduler
            if (action === 'get_reminders') {
                const url = `${supabaseUrl}/rest/v1/reminders?user_id=eq.${userId}&status=eq.pending&order=trigger_at.asc`;
                const data = await querySupabaseApi(url, 'GET', supabaseKey);
                return new Response(JSON.stringify({ success: true, data: data }), { status: 200, headers: corsHeaders });
            }

            // Выгрузка трекеров И всех их логов одной транзакцией для вкладки Трекеры
            if (action === 'get_trackers') {
                const trackersUrl = `${supabaseUrl}/rest/v1/trackers?user_id=eq.${userId}&order=created_at.desc`;
                const trackers = await querySupabaseApi(trackersUrl, 'GET', supabaseKey);

                let logs = [];
                if (Array.isArray(trackers) && trackers.length > 0) {
                    const trackerIds = trackers.map(t => t.id).join(',');
                    const logsUrl = `${supabaseUrl}/rest/v1/tracker_logs?tracker_id=in.(${trackerIds})&order=logged_date.desc`;
                    logs = await querySupabaseApi(logsUrl, 'GET', supabaseKey);
                }

                return new Response(JSON.stringify({ success: true, data: { trackers: trackers, logs: logs } }), {
                    status: 200, headers: corsHeaders
                });
            }
        }

        // ==========================================
        // 2. ОБРАБОТКА POST-ЗАПРОСОВ (ИЗМЕНЕНИЯ В БАЗЕ)
        // ==========================================
        if (method === 'POST') {
            const body = await request.json();
            const { action } = body;

            // Создание пуш-будильника в Supabase
            if (action === 'create_reminder') {
                const url = `${supabaseUrl}/rest/v1/reminders`;
                const row = {
                    user_id: parseInt(body.userId, 10),
                    topic_id: body.topicId,
                    task_text: body.taskText,
                    trigger_at: body.triggerAt,
                    status: 'pending'
                };
                const result = await querySupabaseApi(url, 'POST', supabaseKey, row);
                return new Response(JSON.stringify({ success: true, data: result[0] }), { status: 200, headers: corsHeaders });
            }

            // Создание карточки новой цели/привычки
            if (action === 'create_tracker') {
                const url = `${supabaseUrl}/rest/v1/trackers`;
                const row = {
                    user_id: parseInt(body.userId, 10),
                    topic_id: body.topicId,
                    title: body.title,
                    settings: typeof body.settings === 'string' ? JSON.parse(body.settings) : body.settings,
                    status: 'active'
                };
                const result = await querySupabaseApi(url, 'POST', supabaseKey, row);
                return new Response(JSON.stringify({ success: true, data: result[0] }), { status: 200, headers: corsHeaders });
            }

            // Создание новой записи (лога/заметки) в таблице 'tracker_logs'
            if (action === 'create_log') {
                const url = `${supabaseUrl}/rest/v1/tracker_logs`;
                const row = {
                    tracker_id: parseInt(body.trackerId, 10), // Безопасное приведение к числу
                    value: body.value,
                    note_text: body.noteText || null,
                    logged_date: body.loggedDate
                };
                const result = await querySupabaseApi(url, 'POST', supabaseKey, row);
                return new Response(JSON.stringify({ success: true, data: result }), { status: 200, headers: corsHeaders });
            }

            // Нативное удаление точечного напоминания
            if (action === 'delete_reminder') {
                const url = `${supabaseUrl}/rest/v1/reminders?id=eq.${body.id}`;
                await querySupabaseApi(url, 'DELETE', supabaseKey);
                return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
            }

            // Нативное удаление одного лога/заметки из журнала
            if (action === 'delete_log') {
                const url = `${supabaseUrl}/rest/v1/tracker_logs?id=eq.${body.id}`;
                await querySupabaseApi(url, 'DELETE', supabaseKey);
                return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
            }

            // Удаление всей карточки трекера и всей его истории заметок
            if (action === 'delete_tracker') {
                const deleteLogsUrl = `${supabaseUrl}/rest/v1/tracker_logs?tracker_id=eq.${body.id}`;
                await querySupabaseApi(deleteLogsUrl, 'DELETE', supabaseKey);

                const deleteTrackerUrl = `${supabaseUrl}/rest/v1/trackers?id=eq.${body.id}`;
                await querySupabaseApi(deleteTrackerUrl, 'DELETE', supabaseKey);

                return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ success: false, error: 'Unsupported HTTP Method or Action' }), { status: 400, headers: corsHeaders });

    } catch (err) {
        console.error("Критический сбой на Edge-роуте Supabase:", err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500, headers: corsHeaders 
        });
    }
}
