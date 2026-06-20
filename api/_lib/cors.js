// ============================================
// api/_lib/cors.js
// Описание: CORS-заголовки для всех Edge-функций
// ============================================

export const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Device-Fingerprint, X-Audio-Type, X-Request-Part',
    'Access-Control-Max-Age': '86400',
};

/**
 * Обработать OPTIONS запрос
 * @param {Request} request - Request объект
 * @param {object} extraHeaders - Дополнительные заголовки
 * @returns {Response|null} - Response или null если не OPTIONS
 */
export function handleCORS(request, extraHeaders = {}) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: { ...corsHeaders, ...extraHeaders }
        });
    }
    return null;
}

/**
 * Создать JSON-ответ с CORS заголовками
 * @param {any} data - Данные для ответа
 * @param {number} status - HTTP статус
 * @param {object} extraHeaders - Дополнительные заголовки
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, ...extraHeaders }
    });
}

/**
 * Создать ошибку с CORS заголовками
 * @param {string} message - Сообщение об ошибке
 * @param {number} status - HTTP статус
 * @param {object} extraHeaders - Дополнительные заголовки
 * @returns {Response}
 */
export function errorResponse(message, status = 400, extraHeaders = {}) {
    return jsonResponse({ error: message }, status, extraHeaders);
}
