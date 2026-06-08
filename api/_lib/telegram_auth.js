// api/_lib/telegram-auth.js
async function hmacSha256(key, data) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(data);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
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
    
    const secretKey = await hmacSha256('WebAppData', botToken);
    const computedHash = await hmacSha256(secretKey, dataCheckString);
    
    if (computedHash !== hash) return null;
    const user = JSON.parse(urlParams.get('user') || '{}');
    return user.id ? user : null;
}
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let t = 0; t < 64; t++) {
                let s1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
                let ch = (e & f) ^ (~e & g);
                let temp1 = (h + s1 + ch + K[t] + W[t]) >>> 0;
                let s0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let temp2 = (s0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += H[i].toString(16).padStart(8, '0');
        }
        return result;
    }
    
    const blockSize = 64;
    let keyBytes = new TextEncoder().encode(key);
    if (keyBytes.length > blockSize) {
        keyBytes = new TextEncoder().encode(sha256(key));
    }
    let ipad = new Uint8Array(blockSize);
    let opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
        ipad[i] = 0x36 ^ (keyBytes[i] || 0);
        opad[i] = 0x5c ^ (keyBytes[i] || 0);
    }
    let innerHash = sha256(new TextDecoder().decode(ipad) + message);
    return sha256(new TextDecoder().decode(opad) + innerHash);
}

export function validateTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');
    const sortedKeys = [...urlParams.keys()].sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${urlParams.get(key)}`).join('\n');
    
    const secretKey = hmacSha256('WebAppData', botToken);
    const computedHash = hmacSha256(secretKey, dataCheckString);
    
    if (computedHash !== hash) return null;
    const user = JSON.parse(urlParams.get('user') || '{}');
    return user.id ? user : null;
}
