// api/_lib/telegram-auth.js
async function hmacSha256(key, data) {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function validateTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');
    const sortedKeys = [...urlParams.keys()].sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${urlParams.get(key)}`).join('\n');
    
    // Первый HMAC: secret = HMAC-SHA256("WebAppData", botToken)
    const secretKey = await hmacSha256('WebAppData', botToken);
    // Второй HMAC: computed = HMAC-SHA256(secret, dataCheckString)
    const computedHash = await hmacSha256(secretKey, dataCheckString);
    
    if (computedHash !== hash) return null;
    const user = JSON.parse(urlParams.get('user') || '{}');
    return user.id ? user : null;
}
