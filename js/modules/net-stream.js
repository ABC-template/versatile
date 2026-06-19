// js/modules/net-stream.js - ИСПРАВЛЕННАЯ ВЕРСИЯ (с сохранением разметки)

console.log("✅ net-stream.js загружен (исправленная версия с сохранением разметки)");

// ==========================================
// ДОБАВЛЕНО: БЕЗОПАСНАЯ САНИТАЙЗАЦИЯ ЧЕРЕЗ DOMPurify (имитация)
// ==========================================

// Простая, но безопасная санитайзация — разрешаем только безопасные теги
function safeSanitizeHTML(html) {
    if (!html) return '';
    
    // Список разрешённых тегов и атрибутов
    const ALLOWED_TAGS = [
        'p', 'br', 'strong', 'em', 'u', 'i', 'b', 
        'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 
        'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'span', 'div', 'img', 'hr', 'sub', 'sup'
    ];
    
    const ALLOWED_ATTR = ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'];
    
    // Используем DOMPurify если доступен, иначе встроенный санитайзер
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ALLOWED_TAGS,
            ALLOWED_ATTR: ALLOWED_ATTR,
            ADD_ATTR: ['target'],
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
        });
    }
    
    // Fallback: простая санитайзация через DOM
    try {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Удаляем опасные теги
        const dangerous = temp.querySelectorAll('script, style, iframe, object, embed, form, input, button');
        dangerous.forEach(el => el.remove());
        
        // Обрабатываем ссылки — добавляем target="_blank" и rel="noopener"
        const links = temp.querySelectorAll('a[href]');
        links.forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
        
        return temp.innerHTML;
    } catch (e) {
        console.warn('Ошибка санитайзации, возвращаем текст:', e);
        // В крайнем случае — экранируем HTML
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
}

// ==========================================
// ФУНКЦИЯ СТРИМА
// ==========================================

window.streamAiResponse = async function(cleanHistoryMessages, userKey, userLang, attachedImage, activeChat) {
    console.log('🎯 streamAiResponse вызвана!');
    console.log('📸 Есть фото?', !!attachedImage);
    
    const container = document.getElementById('chat-container');
    if (!container) {
        console.error('❌ chat-container не найден');
        return false;
    }

    let msgDiv = null;
    let accumulatedText = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn('⏰ Таймаут 60 секунд истек');
        controller.abort();
    }, 60000);

    try {
        const requestBody = {
            historyMessages: cleanHistoryMessages,
            currentTopic: userKey,
            userLang: userLang,
            attachedImage: attachedImage || null
        };
        
        console.log('🌊 Отправляем запрос к /api/chat/stream');
        
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка ${response.status}: ${text.substring(0, 200)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let isFirstChunk = true;
        let msgIndex = activeChat ? activeChat.messages.length : Date.now();

        msgDiv = document.createElement('div');
        msgDiv.className = `msg ai-msg msg-animated`;
        msgDiv.id = `msg-block-${userKey}-${msgIndex}`;
        
        // Добавляем атрибут безопасности
        msgDiv.setAttribute('data-sanitized', 'true');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;
            console.log('📦 Получен чанк, длина:', chunk.length);

            if (isFirstChunk && accumulatedText.trim().length > 0) {
                if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                container.appendChild(msgDiv);
                isFirstChunk = false;
            }

            // ==========================================
            // ИСПРАВЛЕНО: БЕЗОПАСНЫЙ РЕНДЕРИНГ С СОХРАНЕНИЕМ РАЗМЕТКИ
            // ==========================================
            if (typeof marked !== 'undefined') {
                try {
                    // Сначала парсим Markdown в HTML
                    const rawHTML = marked.parse(accumulatedText);
                    // Затем безопасно санитайзим HTML
                    const safeHTML = safeSanitizeHTML(rawHTML);
                    msgDiv.innerHTML = safeHTML;
                } catch (markErr) {
                    console.warn('Ошибка marked, используем textContent:', markErr);
                    msgDiv.textContent = accumulatedText;
                }
            } else {
                msgDiv.textContent = accumulatedText;
            }

            container.scrollTop = container.scrollHeight;
        }

        if (accumulatedText.trim().length > 0) {
            finalizeStreamMessage(msgDiv, accumulatedText, activeChat);
        } else {
            console.warn('⚠️ Пустой ответ от сервера');
            if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM('⚠️ Сервер вернул пустой ответ.', 'ai-msg');
            }
        }
        return true;

    } catch (err) {
        console.error("❌ Критический сбой стрима:", err);
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        
        if (msgDiv && accumulatedText.trim().length > 0) {
            const disconnectNotice = `${accumulatedText}\n\n[⚠️ Соединение разорвано]`;
            if (typeof marked !== 'undefined') {
                try {
                    const rawHTML = marked.parse(disconnectNotice);
                    const safeHTML = safeSanitizeHTML(rawHTML);
                    msgDiv.innerHTML = safeHTML;
                } catch {
                    msgDiv.textContent = disconnectNotice;
                }
            } else {
                msgDiv.textContent = disconnectNotice;
            }
            finalizeStreamMessage(msgDiv, disconnectNotice, activeChat);
        } else {
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    }
};

// ==========================================
// ФИНАЛИЗАЦИЯ СООБЩЕНИЯ
// ==========================================

function finalizeStreamMessage(msgDiv, finalText, activeChat) {
    const generatedAiMsgId = window.generateUUID();
    msgDiv.id = `msg-block-${generatedAiMsgId}`;

    // Санитизируем финальный текст перед сохранением
    const safeFinalText = typeof finalText === 'string' ? finalText : String(finalText);

    const act = document.createElement('div');
    act.className = 'msg-actions';
    act.innerHTML = `
        <button class="action-btn" data-tooltip="📋" onclick="window.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
        <button class="action-btn" data-tooltip="🔗" onclick="window.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
        <button class="action-btn" onclick="window.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
        <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.deleteMessage('${generatedAiMsgId}')">🗑️</button>
    `;
    msgDiv.appendChild(act);

    if (activeChat) {
        const aiMessage = { 
            id: generatedAiMsgId, 
            text: safeFinalText, 
            type: 'ai-msg',
            isFavorite: false,
            synced: false
        };
        
        activeChat.messages.push(aiMessage);
        window.saveHistoriesToLocal();
        
        if (window.config && window.config.syncEnabled && activeChat.id) {
            window.syncMessageToCloud(activeChat.id, aiMessage).catch(err => {
                console.error("Синхронизация AI ответа не удалась:", err);
            });
        }
    }
    
    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && typeof window.incrementUsage === 'function') {
        window.incrementUsage();
    }
}

console.log("✅ net-stream.js полностью загружен с сохранением разметки");
