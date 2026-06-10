// api/_lib/telegram-auth.js
export async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');

    const sortedKeys = [...urlParams.keys()].sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${urlParams.get(key)}`).join('\n');

    const encoder = new TextEncoder();
    
    // В Telegram используется HMAC-SHA256 с константой "WebAppData"
    const baseKey = await crypto.subtle.importKey(
      "raw", 
      encoder.encode("WebAppData"), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );
    
    const secretKeyBuffer = await crypto.subtle.sign("HMAC", baseKey, encoder.encode(botToken));
    
    const secretKey = await crypto.subtle.importKey(
      "raw", 
      secretKeyBuffer, 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );
    
    const calculatedHashBuffer = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(dataCheckString));
    
    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) return null;

    const user = JSON.parse(urlParams.get('user') || '{}');
    return user.id ? user : null;
  } catch (e) {
    console.error('Edge WebCrypto Telegram Auth Error:', e);
    return null;
  }
}
