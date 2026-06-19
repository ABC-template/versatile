// api/_lib/supabase-client.js
// Единый клиент для работы с Supabase

let cachedUrl = null;
let cachedKey = null;

export function getSupabaseConfig() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    
    if (!url || !key) {
        throw new Error('Supabase not configured');
    }
    
    return { url, key };
}

export async function supabaseFetch(path, options = {}, config = null) {
    const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig();
    
    const fullUrl = `${supabaseUrl}/rest/v1/${path}`;
    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
    };
    
    // Добавляем Prefer для POST запросов
    if (options.method === 'POST') {
        headers['Prefer'] = 'return=representation';
    }
    
    const res = await fetch(fullUrl, { ...options, headers });
    
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
        if (options.method === 'POST') {
            return Array.isArray(data) ? (data[0] || data) : data;
        }
        return data;
    }
    
    return { success: true };
}

export async function supabaseRPC(functionName, params = {}, config = null) {
    const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig();
    
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
    
    return response.json();
}
