// api /cron /check-reminders.js

export const config = { runtime: 'edge' };

export default async function handler(request) {
    // 1. ИНИЦИАЛИЗАЦИЯ И ПРОВЕРКА КЛЮЧЕЙ ОКРУЖЕНИЯ VERCEL
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const botToken = process.env.BOT_TOKEN?.trim(); // Токен твоего Telegram-бота для отправки пушей

    if (!supabaseUrl || !supabaseKey || !botToken) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'На сервере Vercel не настроены переменные SUPABASE или BOT_TOKEN.' 
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 2. ЗАПРОС К SUPABASE: Ищем задачи со статусом "pending", время которых пришло или уже прошло
        const nowIso = new Date().toISOString();
        const selectUrl = `${supabaseUrl}/rest/v1/reminders?status=eq.pending&trigger_at=lte.${encodeURIComponent(nowIso)}&order=trigger_at.asc`;

        const selectResponse = await fetch(selectUrl, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        const activeReminders = await selectResponse.json();

        if (!Array.isArray(activeReminders) || activeReminders.length === 0) {
            return new Response(JSON.stringify({ success: true, message: 'Нет актуальных напоминаний для отправки.' }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        let sentCount = 0;

        // 3. ЦИКЛ ВЫДАЧИ НАТИВНЫХ ПУШЕЙ ЧЕРЕЗ TELEGRAM BOT API
        for (const reminder of activeReminders) {
            const userId = reminder.user_id;
            const text = reminder.task_text;

            // Формируем красивый, дорогой текст нативного пуш-уведомления
            const pushMessageText = `🔔 *Напоминание от Versatile AI*:\n\n${text}`;

            // Ссылка оформлена строго слитно для корректной работы fetch внутри Edge Runtime
            const telegramApiUrl = `https://telegram.org{botToken}/sendMessage`;

            try {
                const tgResponse = await fetch(telegramApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: userId,
                        text: pushMessageText,
                        parse_mode: 'Markdown' // Поддерживаем жирный шрифт в уведомлении
                    })
                });

                const tgData = await tgResponse.json();

                // Если бот успешно достучался до пользователя — мгновенно меняем статус в базе на 'sent'
                if (tgData.ok) {
                    const updateUrl = `${supabaseUrl}/rest/v1/reminders?id=eq.${reminder.id}`;
                    await fetch(updateUrl, {
                        method: 'PATCH', // Используем PATCH для точечного обновления одной колонки
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'sent' })
                    });
                    sentCount++;
                } else {
                    console.error(`Бот не смог отправить пуш пользователю ${userId}. Ошибка: ${tgData.description}`);
                    
                    // Если пользователь заблокировал бота, переводим в статус 'failed', чтобы не спамить базу бесконечными повторами
                    if (tgData.error_code === 403) {
                        const updateUrl = `${supabaseUrl}/rest/v1/reminders?id=eq.${reminder.id}`;
                        await fetch(updateUrl, {
                            method: 'PATCH',
                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'failed' })
                        });
                    }
                }
            } catch (tgErr) {
                console.error(`Сбой сети при отправке пуша через Telegram Bot API:`, tgErr.message);
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Обработка завершена. Успешно отправлено пуш-уведомлений: ${sentCount}` 
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error("Критический сбой внутри Cron-роута напоминаний:", err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
