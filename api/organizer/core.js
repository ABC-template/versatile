// api /organizer /core.js (Часть 1 из 2)

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
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); // Секретный service_role ключ

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ success: false, error: 'Переменные SUPABASE_URL или KEY не настроены в Vercel.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    const { searchParams } = new URL(request.url);
    const method = request.method;

    try {
        // ОБРАБОТКА GET-ЗАПРОСОВ (ВЫГРУЗКА ДАННЫХ ИЗ ОБЛАКА)
        if (method === 'GET') {
            const action = searchParams.get('action');
            const userId = searchParams.get('userId');

            if (!userId) {
                return new Response(JSON.stringify({ success: false, error: 'Missing userId parameter' }), { status: 400 });
            }

            // Выгрузка пуш-напоминаний для вкладки Scheduler
            if (action === 'get_reminders') {
                const url = `${supabaseUrl}/rest/v1/reminders?user_id=eq.${userId}&status=eq.pending&order=trigger_at.asc`;
                const data = await querySupabaseApi(url, 'GET', supabaseKey);
                return new Response(JSON.stringify({ success: true, data: data }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Выгрузка трекеров И всех их логов одной транзакцией для вкладки Трекеры
            if (action === 'get_trackers') {
                const trackersUrl = `${supabaseUrl}/rest/v1/trackers?user_id=eq.${userId}&order=created_at.desc`;
                const trackers = await querySupabaseApi(trackersUrl, 'GET', supabaseKey);

                // Если у юзера есть трекеры, вытягиваем всю историю логов/заметок по ним
                let logs = [];
                if (Array.isArray(trackers) && trackers.length > 0) {
                    const trackerIds = trackers.map(t => t.id).join(',');
                    const logsUrl = `${supabaseUrl}/rest/v1/tracker_logs?tracker_id=in.(${trackerIds})&order=logged_date.desc`;
                    logs = await querySupabaseApi(logsUrl, 'GET', supabaseKey);
                }

                return new Response(JSON.stringify({ success: true, data: { trackers: trackers, logs: logs } }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ОБРАБОТКА POST-ЗАПРОСОВ (СОЗДАНИЕ И УДАЛЕНИЕ СТРОК)
        if (method === 'POST') {
            const body = await request.json();
            const { action } = body;

            // Создание пуш-будильника в Supabase таблице 'reminders'
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
                return new Response(JSON.stringify({ success: true, data: result[0] }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Создание карточки новой цели/привычки в Supabase таблице 'trackers'
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
                return new Response(JSON.stringify({ success: true, data: result[0] }), { headers: { 'Content-Type': 'application/json' } });
            }
          // api /organizer /core.js (Часть 2 из 2)

            // Создание новой записи (лога/заметки) в таблице 'tracker_logs'
            if (action === 'create_log') {
                const url = `${supabaseUrl}/rest/v1/tracker_logs`;
                const row = {
                    tracker_id: body.trackerId,
                    value: body.value,
                    note_text: body.noteText || null,
                    logged_date: body.loggedDate
                };
                const result = await querySupabaseApi(url, 'POST', supabaseKey, row);
                return new Response(JSON.stringify({ success: true, data: result }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Нативное удаление точечного напоминания
            if (action === 'delete_reminder') {
                const url = `${supabaseUrl}/rest/v1/reminders?id=eq.${body.id}`;
                await querySupabaseApi(url, 'DELETE', supabaseKey);
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Нативное удаление одного лога/заметки из журнала
            if (action === 'delete_log') {
                const url = `${supabaseUrl}/rest/v1/tracker_logs?id=eq.${body.id}`;
                await querySupabaseApi(url, 'DELETE', supabaseKey);
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Удаление всей карточки трекера (каскадное удаление его логов сделаем вручную для надежности)
            if (action === 'delete_tracker') {
                // Сначала чистим все связанные логи из tracker_logs
                const deleteLogsUrl = `${supabaseUrl}/rest/v1/tracker_logs?tracker_id=eq.${body.id}`;
                await querySupabaseApi(deleteLogsUrl, 'DELETE', supabaseKey);

                // Затем удаляем сам трекер
                const deleteTrackerUrl = `${supabaseUrl}/rest/v1/trackers?id=eq.${body.id}`;
                await querySupabaseApi(deleteTrackerUrl, 'DELETE', supabaseKey);

                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        return new Response(JSON.stringify({ success: false, error: 'Unsupported HTTP Method or Action' }), { status: 400 });

    } catch (err) {
        console.error("Критический сбой на Edge-роуте Supabase:", err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
