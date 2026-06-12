// api/_lib/send-push.js
// Утилита для отправки тихих push-уведомлений через Telegram Bot API

export async function sendSilentPush(userId, botToken) {
    if (!userId || !botToken) {
        console.log("❌ Невозможно отправить push: нет userId или botToken");
        return false;
    }
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: userId,
                text: "🔄",
                disable_notification: true,      // Без звука и всплывашки
                disable_web_page_preview: true    // Без превью ссылок
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            console.log(`✅ Push отправлен пользователю ${userId}`);
            return true;
        } else {
            console.error(`❌ Ошибка отправки push: ${data.description}`);
            return false;
        }
    } catch (err) {
        console.error(`❌ Исключение при отправке push: ${err.message}`);
        return false;
    }
}

// Версия с буферизацией (не чаще 1 раза в 5 секунд)
let pendingPushTimeout = null;
let pendingPushUserIds = new Set();

export function scheduleSilentPush(userId, botToken) {
    pendingPushUserIds.add(userId);
    
    if (pendingPushTimeout) clearTimeout(pendingPushTimeout);
    
    pendingPushTimeout = setTimeout(async () => {
        for (const uid of pendingPushUserIds) {
            await sendSilentPush(uid, botToken);
        }
        pendingPushUserIds.clear();
        pendingPushTimeout = null;
    }, 5000);
}
