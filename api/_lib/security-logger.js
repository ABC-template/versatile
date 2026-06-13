// api/_lib/security-logger.js
export async function logSecurityEvent(userId, action, details, request) {
    // Только в production или всегда?
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && !process.env.FORCE_SECURITY_LOG) {
        return; // В разработке не логируем, чтобы не засорять
    }
    
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Security log skipped: Supabase not configured');
        return;
    }
    
    const logEntry = {
        user_id: userId || null,
        action: action,
        details: typeof details === 'string' ? details : JSON.stringify(details),
        ip: request?.headers?.get('cf-connecting-ip') || 
             request?.headers?.get('x-forwarded-for') || 
             'unknown',
        user_agent: request?.headers?.get('user-agent') || 'unknown',
        origin: request?.headers?.get('origin') || 'unknown',
        timestamp: new Date().toISOString()
    };
    
    try {
        await fetch(`${supabaseUrl}/rest/v1/security_logs`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(logEntry)
        });
    } catch (err) {
        // Не проваливаем основной запрос из-за ошибки логирования
        console.error('Failed to write security log:', err.message);
    }
}

// Проверяем, не спамит ли один IP
const ipRequestCount = new Map(); // Временно, для Edge Runtime
export function isRateLimitExceeded(ip, limit = 100, windowMs = 60000) {
    const now = Date.now();
    const record = ipRequestCount.get(ip);
    
    if (!record) {
        ipRequestCount.set(ip, { count: 1, resetTime: now + windowMs });
        return false;
    }
    
    if (now > record.resetTime) {
        ipRequestCount.set(ip, { count: 1, resetTime: now + windowMs });
        return false;
    }
    
    record.count++;
    if (record.count > limit) {
        return true;
    }
    
    return false;
}
