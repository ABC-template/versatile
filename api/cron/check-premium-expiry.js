// api/cron/check-premium-expiry.js
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
      throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
    }
    
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return { success: true };
    }
    
    return res.json();
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();

  // ==========================================
  // ФАЗА 1: Уведомления об истечении подписки
  // ==========================================
  let users = [];
  try {
    users = await supabaseFetch(`users?role=eq.premium&premium_until=gte.${fromDate}&premium_until=lte.${toDate}&select=telegram_id,premium_until,role`);
    if (!Array.isArray(users)) users = [];
  } catch (err) {
    console.error('Ошибка получения пользователей:', err);
    users = [];
  }

  let sent = 0;
  for (const user of users) {
    const expiry = new Date(user.premium_until);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0 || daysLeft > 5) continue;

    try {
      const notifs = await supabaseFetch(`premium_notifications?user_id=eq.${user.telegram_id}&notified_at=eq.${today}&select=notified_at`);
      if (notifs && notifs.length > 0) continue;
    } catch (err) {
      console.error('Ошибка проверки уведомлений:', err);
      continue;
    }

    let message = '';
    let notificationType = 'expiry_warning';
    
    if (daysLeft > 0) {
      const dayWord = (daysLeft % 10 === 1 && daysLeft % 100 !== 11) ? 'день' : 
                      ((daysLeft % 10 >= 2 && daysLeft % 10 <= 4 && (daysLeft % 100 < 10 || daysLeft % 100 >= 20)) ? 'дня' : 'дней');
      message = `⚠️ Ваша PRO-подписка истекает через ${daysLeft} ${dayWord}. Продлите, чтобы не потерять синхронизацию чатов и расширенные лимиты.`;
      notificationType = 'expiry_warning';
    } else {
      message = `⏰ Ваша PRO-подписка истекла сегодня. Ваши чаты будут храниться в облаке ещё 7 дней. Скачайте архив в приложении или продлите PRO, иначе облачные данные будут безвозвратно удалены.`;
      notificationType = 'final_notice';
      
      try {
        const userData = await supabaseFetch(`users?telegram_id=eq.${user.telegram_id}&select=data_deadline`);
        if (!userData[0]?.data_deadline) {
          const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await supabaseFetch(`users?telegram_id=eq.${user.telegram_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ data_deadline: deadline })
          });
        }
      } catch (err) {
        console.error(`Ошибка установки дедлайна для ${user.telegram_id}:`, err);
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
            notification_type: notificationType
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

  // ==========================================
  // ФАЗА 2: Уведомление ЗА 1 ДЕНЬ до удаления данных
  // ==========================================
  let deleteWarnings = 0;
  try {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).toISOString();
    const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1).toISOString();
    
    const expiringUsers = await supabaseFetch(`users?data_deadline=gte.${tomorrowStart}&data_deadline=lt.${tomorrowEnd}&select=telegram_id,data_deadline`);
    
    if (Array.isArray(expiringUsers)) {
      for (const expUser of expiringUsers) {
        try {
          const existingWarning = await supabaseFetch(`premium_notifications?user_id=eq.${expUser.telegram_id}&notification_type=eq.delete_warning&notified_at=eq.${today}&select=notified_at`);
          if (existingWarning && existingWarning.length > 0) continue;
          
          const message = `⚠️ ВНИМАНИЕ! Завтра (${new Date(expUser.data_deadline).toLocaleDateString()}) ваши облачные чаты будут безвозвратно удалены. Скачайте архив прямо сейчас через приложение Versatile AI, чтобы сохранить историю диалогов. Продлите PRO-подписку, чтобы продолжить пользоваться облачной синхронизацией.`;
          
          const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const resp = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: expUser.telegram_id,
              text: message,
              parse_mode: 'Markdown'
            })
          });
          const json = await resp.json();
          if (json.ok) {
            await supabaseFetch('premium_notifications', {
              method: 'POST',
              body: JSON.stringify({
                user_id: expUser.telegram_id,
                notified_at: today,
                days_left: -7,
                notification_type: 'delete_warning'
              })
            });
            deleteWarnings++;
            console.log(`📢 Предупреждение об удалении отправлено ${expUser.telegram_id}`);
          }
        } catch (err) {
          console.error(`Ошибка предупреждения для ${expUser.telegram_id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка в фазе предупреждения об удалении:', err.message);
  }

  // ==========================================
  // ФАЗА 3: Физическое удаление данных
  // ==========================================
  let deletedUsersCount = 0;
  let deletedChatsCount = 0;
  let deletedMessagesCount = 0;
  
  try {
    const expiredUsers = await supabaseFetch(`users?data_deadline=lte.${now.toISOString()}&select=telegram_id`);
    
    if (Array.isArray(expiredUsers)) {
      for (const expUser of expiredUsers) {
        try {
          const userChats = await supabaseFetch(`chats?user_id=eq.${expUser.telegram_id}&select=id`);
          if (Array.isArray(userChats) && userChats.length > 0) {
            const chatIds = userChats.map(c => c.id).join(',');
            const messagesCount = await supabaseFetch(`messages?chat_id=in.(${chatIds})&select=id`);
            deletedChatsCount += userChats.length;
            deletedMessagesCount += Array.isArray(messagesCount) ? messagesCount.length : 0;
          }
        } catch (countErr) {
          console.error('Ошибка подсчета данных:', countErr.message);
        }
        
        await supabaseFetch(`chats?user_id=eq.${expUser.telegram_id}`, { method: 'DELETE' });
        await supabaseFetch(`reminders?user_id=eq.${expUser.telegram_id}`, { method: 'DELETE' });
        await supabaseFetch(`trackers?user_id=eq.${expUser.telegram_id}`, { method: 'DELETE' });
        
        await supabaseFetch(`users?telegram_id=eq.${expUser.telegram_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ data_deadline: null })
        });
        
        deletedUsersCount++;
        console.log(`🗑️ Удалены данные пользователя ${expUser.telegram_id}`);
      }
    }
  } catch (cleanErr) {
    console.error('Ошибка в фазе очистки:', cleanErr.message);
  }

  const report = {
    success: true,
    timestamp: now.toISOString(),
    notifications_sent: sent,
    delete_warnings_sent: deleteWarnings,
    users_deleted: deletedUsersCount,
    chats_deleted: deletedChatsCount,
    messages_deleted: deletedMessagesCount
  };
  
  console.log('✅ Cron выполнен:', JSON.stringify(report));
  
  return new Response(JSON.stringify(report), { 
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
