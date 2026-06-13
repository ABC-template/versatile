// api/_lib/validate-uuid.js
// Простая и быстрая валидация UUID v4

export function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    
    // Регулярное выражение для UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

export function validateChatId(chatId, corsHeaders) {
    if (!chatId || !isValidUUID(chatId)) {
        return new Response(JSON.stringify({ error: 'Invalid chat ID format' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    return null; // Валидация пройдена
}

export function validateMessageId(messageId, corsHeaders) {
    if (!messageId || !isValidUUID(messageId)) {
        return new Response(JSON.stringify({ error: 'Invalid message ID format' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    return null;
}
