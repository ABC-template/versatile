// api/_lib/validate-uuid.js
export function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

export function validateChatId(chatId, response, corsHeaders) {
    if (!chatId || !isValidUUID(chatId)) {
        return new Response(JSON.stringify({ error: 'Invalid chat ID format' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    return null; // Валидация пройдена
}

export function validateMessageId(messageId, response, corsHeaders) {
    if (!messageId || !isValidUUID(messageId)) {
        return new Response(JSON.stringify({ error: 'Invalid message ID format' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    return null;
}
