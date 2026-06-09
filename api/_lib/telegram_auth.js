// api/_lib/telegram-auth.js
export function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return null;
  urlParams.delete('hash');
  const sortedKeys = [...urlParams.keys()].sort();
  const dataCheckString = sortedKeys.map(key => `${key}=${urlParams.get(key)}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const user = JSON.parse(urlParams.get('user') || '{}');
  return user.id ? user : null;
}
