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
    
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    
    params.delete('hash');
    // Критично: параметры сортируются по ключу
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys
        .map(key => `${key}=${params.get(key)}`)
        .join('\n');
    
    // Важно: botToken должен быть ТОЧНО токеном бота
    const secret = await hmacSha256('WebAppData', botToken);
    const computedHash = await hmacSha256(secret, dataCheckString);
    
    if (computedHash !== hash) {
        console.error('Hash mismatch', { computedHash, receivedHash: hash, dataCheckString });
        return null;
    }
    
    const user = JSON.parse(params.get('user') || '{}');
    return user.id ? user : null;
}
