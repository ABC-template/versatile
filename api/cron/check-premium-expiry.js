export const config = { runtime: 'edge' };

export default async function handler(request) {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!supabaseUrl || !supabaseKey || !botToken) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 });
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
      throw new Error(`Supabase error ${res.status}: ${text}`);
    }
    return res.json();
  }

  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const fromDate = new Date(now.getTime() - 7*24*60*60*1000).toISOString();
  const toDate = new Date(now.getTime() + 6*24*60*60*1000).toISOString();

  const users = await supabaseFetch(`users?role=eq.premium&premium_until=gte.${fromDate}&premium_until=lte.${toDate}&select=telegram_id,premium_until,role`);

  let sent = 0;
  for (const user of users) {
    const expiry = new Date(user.premium_until);
    const daysLeft = Math.ceil((expiry - now) / (1000*60*60*24));
    if (daysLeft < 0 || daysLeft > 5) continue;

    const notifs = await supabaseFetch(`premium_notifications?user_id=eq.${user.telegram_id}&notified_at=eq.${today}&select=notified_at`);
    if (notifs && notifs.length > 0) continue;

    let message = '';
    if (daysLeft > 0) {
      const dayWord = (daysLeft % 10 === 1 && daysLeft % 100 !== 11) ? 'день' : ((daysLeft % 10 >= 2 && daysLeft % 10 <= 4 && (daysLeft % 100 < 10 || daysLeft % 100 >= 20)) ? 'дня' : 'дней');
      message = `⚠️ Ваша PRO-подписка истекает через ${daysLeft} ${dayWord}. Продлите, чтобы не потерять синхронизацию чатов и расширенные лимиты.`;
    } else {
      message = `⏰ Ваша PRO-подписка истекла сегодня. Ваши чаты будут храниться ещё 7 дней. Скачайте их или продлите PRO, иначе всё будет удалено.`;
      const userData = await supabaseFetch(`users?telegram_id=eq.${user.telegram_id}&select=data_deadline`);
      if (!userData[0]?.data_deadline) {
        const deadline = new Date(now.getTime() + 7*24*60*60*1000).toISOString();
        await supabaseFetch(`users?telegram_id=eq.${user.telegram_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ data_deadline: deadline })
        });
      }
    }

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
        await supabaseFetch('premium_notifications', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.telegram_id,
            notified_at: today,
            days_left: daysLeft,
            notification_type: daysLeft === 0 ? 'final_notice' : 'expiry_warning'
          })
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
