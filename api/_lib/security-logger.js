// api/_lib/security-logger.js
// Опциональное логирование (можешь удалить, если не нужно)

export async function logSecurityEvent(userId, action, details, request) {
    // Если не хочешь логировать, просто возвращай
    if (!process.env.ENABLE_SECURITY_LOGS) {
        return;
    }
    
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    
    if (!supabaseUrl || !supabaseKey) {
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
        // Игнорируем ошибки логирования
        console.error('Failed to write security log:', err.message);
    }
}
