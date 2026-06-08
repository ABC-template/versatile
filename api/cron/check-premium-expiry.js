// api/cron/check-premium-expiry.js
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  // Проверка секрета (через заголовок Authorization: Bearer <secret>)
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); // используем service_role для cron
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!supabaseUrl || !supabaseKey || !botToken) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const now = new Date();
  const today = now.toISOString().slice(0,10);

  // Найти premium пользователей с истекающей подпиской (включая уже истекших за последние 7 дней)
  const { data: users, error } = await supabase
    .from('users')
    .select('telegram_id, premium_until, role')
    .eq('role', 'premium')
    .lt('premium_until', new Date(now.getTime() + 6*24*60*60*1000).toISOString()) // следующие 6 дней
    .gte('premium_until', new Date(now.getTime() - 7*24*60*60*1000).toISOString()); // не старше 7 дней назад
  if (error) throw error;

  let sent = 0;
  for (const user of users) {
    const expiry = new Date(user.premium_until);
    const daysLeft = Math.ceil((expiry - now) / (1000*60*60*24));
    // Уведомляем, если осталось от 5 до 0 дней (включая 0)
    if (daysLeft < 0 || daysLeft > 5) continue;

    // Проверяем, не отправляли ли уведомление за сегодня
    const { data: notif } = await supabase
      .from('premium_notifications')
      .select('notified_at')
      .eq('user_id', user.telegram_id)
      .eq('notified_at', today)
      .maybeSingle();
    if (notif) continue;

    let message = '';
    if (daysLeft > 0) {
      message = `⚠️ Ваша PRO-подписка истекает через ${daysLeft} ${getDayWord(daysLeft)}. Продлите, чтобы не потерять синхронизацию чатов и расширенные лимиты.`;
    } else {
      message = `⏰ Ваша PRO-подписка истекла сегодня. Ваши чаты будут храниться ещё 7 дней. Скачайте их или продлите PRO, иначе всё будет удалено.`;
      // Устанавливаем data_deadline = now + 7 дней (если ещё не установлен)
      const { data: hasDeadline } = await supabase
        .from('users')
        .select('data_deadline')
        .eq('telegram_id', user.telegram_id)
        .single();
      if (!hasDeadline?.data_deadline) {
        const deadline = new Date(now.getTime() + 7*24*60*60*1000).toISOString();
        await supabase.from('users').update({ data_deadline: deadline }).eq('telegram_id', user.telegram_id);
      }
    }

    // Отправляем пуш через Telegram бота
    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
      const resp = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      const json = await resp.json();
      if (json.ok) {
        // Записываем факт отправки
        await supabase.from('premium_notifications').insert({
          user_id: user.telegram_id,
          notified_at: today,
          days_left: daysLeft,
          notification_type: daysLeft === 0 ? 'final_notice' : 'expiry_warning'
        });
        sent++;
      } else {
        console.error(`Не удалось отправить уведомление ${user.telegram_id}: ${json.description}`);
      }
    } catch (err) {
      console.error(`Ошибка отправки для ${user.telegram_id}:`, err.message);
    }
  }

  return new Response(JSON.stringify({ success: true, sent }), { status: 200 });
}

function getDayWord(days) {
  if (days % 10 === 1 && days % 100 !== 11) return 'день';
  if ([2,3,4].includes(days % 10) && ![12,13,14].includes(days % 100)) return 'дня';
  return 'дней';
}
