// ============================================
// api/_lib/supabase-client.js
// Описание: Единый клиент для работы с Supabase
// ============================================

/**
 * Получить конфигурацию Supabase
 * @param {string} type - 'anon' или 'service'
 * @returns {{ url: string, key: string }}
 */
export function getSupabaseConfig(type = 'anon') {
    const url = process.env.SUPABASE_URL?.trim();
    if (!url) {
        throw new Error('SUPABASE_URL not configured');
    }
    
    let key;
    if (type === 'service') {
        key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        }
    } else {
        key = process.env.SUPABASE_ANON_KEY?.trim();
        if (!key) {
            throw new Error('SUPABASE_ANON_KEY not configured');
        }
    }
    
    return { url, key };
}

/**
 * Выполнить запрос к Supabase REST API
 * @param {string} path - Путь (например, 'chats?id=eq.123')
 * @param {object} options - Опции fetch
 * @param {object} config - Конфигурация (опционально)
 * @param {string} type - 'anon' или 'service'
 * @returns {Promise<any>}
 */
export async function supabaseFetch(path, options = {}, config = null, type = 'anon') {
    const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig(type);
    
    const fullUrl = `${supabaseUrl}/rest/v1/${path}`;
    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
    };
    
    // Добавляем Prefer для POST запросов
    if (options.method === 'POST' && !options.headers?.Prefer) {
        headers['Prefer'] = 'return=representation';
    }
    
    const res = await fetch(fullUrl, { 
        ...options, 
        headers: { ...headers, ...options.headers } 
    });
    
    // Обработка пустого ответа
    if (res.status === 204 || res.headers.get('content-length') === '0') {
        return { success: true };
    }
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await res.json();
        // Для POST возвращаем первый элемент массива
        if (options.method === 'POST' && Array.isArray(data)) {
            return data[0] || data;
        }
        return data;
    }
    
    return { success: true };
}

/**
 * Выполнить RPC-запрос к Supabase
 * @param {string} functionName - Имя функции
 * @param {object} params - Параметры
 * @param {object} config - Конфигурация (опционально)
 * @param {string} type - 'anon' или 'service'
 * @returns {Promise<any>}
 */
export async function supabaseRPC(functionName, params = {}, config = null, type = 'anon') {
    const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig(type);
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    });
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`RPC ${functionName} error: ${text.substring(0, 200)}`);
    }
    
    // Проверяем, есть ли тело ответа
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    
    return { success: true };
}

/**
 * Установить контекст пользователя для RLS
 * @param {number} userId - ID пользователя
 * @param {object} config - Конфигурация (опционально)
 * @returns {Promise<void>}
 */
export async function setAppUserContext(userId, config = null) {
    try {
        await supabaseRPC('set_app_user_id', { uid: userId }, config, 'service');
    } catch (err) {
        console.error('Failed to set user context:', err.message);
        // Не выбрасываем ошибку, чтобы не ломать запрос
    }
}

/**
 * Проверить права на синхронизацию
 * @param {number} userId - ID пользователя
 * @param {object} config - Конфигурация (опционально)
 * @returns {Promise<boolean>}
 */
export async function canUserSync(userId, config = null) {
    try {
        const result = await supabaseRPC('can_sync', { uid: userId }, config, 'service');
        return result === true || result === 'true';
    } catch (err) {
        console.error('Failed to check sync permission:', err.message);
        return false;
    }
}

/**
 * Проверить лимит использований
 * @param {number} userId - ID пользователя
 * @param {object} config - Конфигурация (опционально)
 * @returns {Promise<{ allowed: boolean, used: number, limit: number }>}
 */
export async function checkUsageLimit(userId, config = null) {
    try {
        const result = await supabaseRPC('check_usage_limit', { uid: userId }, config, 'service');
        if (result && typeof result === 'object') {
            return {
                allowed: result.allowed === true || result.allowed === 'true',
                used: parseInt(result.used || 0, 10),
                limit: parseInt(result.limit || 5, 10)
            };
        }
        return { allowed: true, used: 0, limit: 5 };
    } catch (err) {
        console.error('Failed to check usage limit:', err.message);
        return { allowed: true, used: 0, limit: 5 };
    }
}

/**
 * Инкремент счетчика использований
 * @param {number} userId - ID пользователя
 * @param {object} config - Конфигурация (опционально)
 * @returns {Promise<number>}
 */
export async function incrementUsage(userId, config = null) {
    try {
        const result = await supabaseRPC('increment_usage', { uid: userId }, config, 'service');
        return parseInt(result || 0, 10);
    } catch (err) {
        console.error('Failed to increment usage:', err.message);
        return 0;
    }
}
