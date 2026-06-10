// api/_lib/telegram-auth.js
export async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return false;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Сортируем ключи, как требует Telegram
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

    const encoder = new TextEncoder();

    // 1. Создаем секретный ключ из WebTelegramData и токена бота
    const baseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebTelegramData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const secretKeyBuffer = await crypto.subtle.sign(
      "HMAC",
      baseKey,
      encoder.encode(botToken)
    );

    // 2. Считаем итоговый HMAC-SHA256 хэш от полученных данных
    const secretKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const calculatedHashBuffer = await crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(dataCheckString)
    );

    // Переводим буфер в hex-строку
    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return calculatedHash === hash;
  } catch (e) {
    console.error('Telegram auth error:', e);
    return false;
  }
}
