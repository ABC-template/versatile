// api/_lib/telegram-auth.js
// Синхронный HMAC-SHA256 для Edge Runtime
function hmacSha256(key, message) {
    function sha256(message) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        let bitLength = data.length * 8;
        let padded = new Uint8Array(((data.length + 8 + 63) & ~63) + (data.length % 64 < 56 ? 0 : 64));
        padded.set(data);
        padded[data.length] = 0x80;
        const view = new DataView(padded.buffer);
        view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
        view.setUint32(padded.length - 4, bitLength & 0xffffffff, false);
        let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        for (let i = 0; i < padded.length; i += 64) {
            let W = new Array(64);
            for (let t = 0; t < 16; t++) {
                W[t] = (padded[i + t * 4] << 24) | (padded[i + t * 4 + 1] << 16) | (padded[i + t * 4 + 2] << 8) | padded[i + t * 4 + 3];
            }
            for (let t = 16; t < 64; t++) {
                let s0 = (rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3)) >>> 0;
                let s1 = (rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10)) >>> 0;
                W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
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
