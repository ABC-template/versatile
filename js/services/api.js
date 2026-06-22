// ============================================
// js/services/api.js
// Описание: Базовый API-клиент с улучшенной обработкой ошибок
// Версия: 2.0.0
// ============================================

class ApiClient {
    constructor() {
        this.baseUrl = '';
        this.initData = null;
        this.timeout = 30000;
        this.retries = 3;
        this.retryDelay = 1000;
        
        this.initFromTelegram();
    }
    
    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    
    initFromTelegram() {
        const tg = window.Telegram?.WebApp;
        this.initData = tg?.initData || null;
        
        if (!this.initData) {
            console.warn('⚠️ Telegram initData не найден');
        }
    }
    
    // ==========================================
    // БАЗОВЫЙ ЗАПРОС
    // ==========================================
    
    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
        
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': this.initData || ''
            },
            signal: AbortSignal.timeout(this.timeout)
        };
        
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };
        
        // Если есть body, добавляем его
        if (options.body && typeof options.body === 'object') {
            mergedOptions.body = JSON.stringify(options.body);
        }
        
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.retries; attempt++) {
            try {
                const response = await fetch(url, mergedOptions);
                
                // Обработка 304 (Not Modified)
                if (response.status === 304) {
                    return { success: true, cached: true, status: 304 };
                }
                
                // Проверяем Content-Type
                const contentType = response.headers.get('content-type') || '';
                
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    let errorDetails = null;
                    
                    if (contentType.includes('application/json')) {
                        try {
                            const errorData = await response.json();
                            errorMessage = errorData.error || errorData.message || errorMessage;
                            errorDetails = errorData;
                        } catch (e) {
                            // Игнорируем
                        }
                    } else {
                        try {
                            const text = await response.text();
                            if (text && text.length < 200) {
                                errorMessage = text;
                            }
                        } catch (e) {
                            // Игнорируем
                        }
                    }
                    
                    // Детальное логирование ошибки
                    console.error(`❌ API Error [${endpoint}]:`, {
                        status: response.status,
                        statusText: response.statusText,
                        error: errorMessage,
                        details: errorDetails,
                        attempt: attempt
                    });
                    
                    throw new ApiError(errorMessage, response.status, errorDetails);
                }
                
                // Пустой ответ
                if (response.status === 204 || response.headers.get('content-length') === '0') {
                    return { success: true, status: 204 };
                }
                
                // JSON ответ
                if (contentType.includes('application/json')) {
                    const data = await response.json();
                    return data;
                }
                
                // Текстовый ответ (для стримов)
                return response;
                
            } catch (err) {
                lastError = err;
                
                // Если это ошибка API, не ретраим
                if (err instanceof ApiError && err.status < 500) {
                    throw err;
                }
                
                // Если это не последняя попытка и ошибка сети/таймаут
                if (attempt < this.retries && 
                    (err.name === 'AbortError' || err.name === 'TypeError' || err.message?.includes('network'))) {
                    
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    console.log(`🔄 Повторная попытка ${attempt}/${this.retries} через ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                break;
            }
        }
        
        console.error(`❌ API Error [${endpoint}]: Все попытки неудачны`, lastError);
        throw lastError || new ApiError('Request failed', 500);
    }
    
    // ==========================================
    // ОБЕРТКИ ДЛЯ МЕТОДОВ
    // ==========================================
    
    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }
    
    async post(endpoint, body, options = {}) {
        return this.request(endpoint, { 
            ...options, 
            method: 'POST',
            body: body
        });
    }
    
    async put(endpoint, body, options = {}) {
        return this.request(endpoint, { 
            ...options, 
            method: 'PUT',
            body: body
        });
    }
    
    async patch(endpoint, body, options = {}) {
        return this.request(endpoint, { 
            ...options, 
            method: 'PATCH',
            body: body
        });
    }
    
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
    
    // ==========================================
    // СТРИМИНГ
    // ==========================================
    
    async stream(endpoint, body, onChunk) {
        const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': this.initData || ''
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Stream error ${response.status}: ${text.substring(0, 200)}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let accumulatedText = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('data: ')) {
                        const jsonStr = trimmedLine.slice(6).trim();
                        if (jsonStr === '[DONE]') continue;
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            const content = data.choices?.[0]?.delta?.content;
                            if (content) {
                                accumulatedText += content;
                                if (onChunk) {
                                    onChunk(content, accumulatedText);
                                }
                            }
                        } catch (e) {
                            // Игнорируем невалидный JSON
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Stream reading error:', err);
            throw err;
        }
        
        return accumulatedText;
    }
}

// ==========================================
// КАСТОМНАЯ ОШИБКА API
// ==========================================

class ApiError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

// Экспорт
window.ApiClient = ApiClient;
window.ApiError = ApiError;
window.apiClient = new ApiClient();

console.log('✅ ApiClient v2.0 загружен');
