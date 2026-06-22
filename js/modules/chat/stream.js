// ============================================
// js/modules/chat/stream.js
// Описание: Стриминг ответов от ИИ (УПРОЩЕННАЯ ВЕРСИЯ)
// Версия: 3.0.0
// ============================================

console.log('✅ ChatStream v3.0 загружен');

window.streamAiResponse = async function(historyMessages, topic, userLang, attachedImage, activeChat) {
    console.log('🎯 streamAiResponse вызвана');
    console.log('📸 Есть фото?', !!attachedImage);

    const container = document.getElementById('chat-container');
    if (!container) {
        console.error('❌ chat-container не найден');
        return false;
    }

    const uiRenderer = window.uiRenderer;
    const chatStore = window.chatStore;

    let msgDiv = null;
    let accumulatedText = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn('⏰ Таймаут 60 секунд истек');
        controller.abort();
    }, 60000);

    try {
        const requestBody = {
            historyMessages: historyMessages || [],
            currentTopic: topic || chatStore.currentTopic,
            userLang: userLang || 'ru',
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
        msgDiv.className = 'msg ai-msg msg-animated';
        msgDiv.id = `msg-block-${Date.now()}-${msgIndex}`;
        msgDiv.setAttribute('data-sanitized', 'true');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;

            if (isFirstChunk && accumulatedText.trim().length > 0) {
                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
                container.appendChild(msgDiv);
                isFirstChunk = false;
            }

            // Рендеринг с Markdown и санитайзингом
            if (typeof marked !== 'undefined') {
                try {
                    let rawHTML = marked.parse(accumulatedText);
                    let safeHTML = rawHTML;
                    if (typeof DOMPurify !== 'undefined') {
                        safeHTML = DOMPurify.sanitize(rawHTML, {
                            ALLOWED_TAGS: [
                                'p', 'br', 'strong', 'em', 'u', 'i', 'b',
                                'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                'ul', 'ol', 'li', 'blockquote',
                                'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                                'span', 'div', 'img', 'hr', 'sub', 'sup'
                            ],
                            ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'],
                            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
                        });
                    }
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

        // ✅ Упрощенно: сохраняем AI-сообщение
        if (accumulatedText.trim().length > 0) {
            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            msgDiv.id = `msg-block-${generatedAiMsgId}`;

            const safeFinalText = typeof accumulatedText === 'string' ? accumulatedText : String(accumulatedText);

            // Добавляем действия
            const act = document.createElement('div');
            act.className = 'msg-actions';
            act.innerHTML = `
                <button class="action-btn" data-tooltip="📋" onclick="window.chatSend.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
                <button class="action-btn" data-tooltip="🔗" onclick="window.chatSend.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
                <button class="action-btn" onclick="window.chatSend.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
                <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.chatSend.deleteMessage('${generatedAiMsgId}')">🗑️</button>
            `;
            msgDiv.appendChild(act);

            // ✅ Сохраняем локально (всегда)
            const aiMessage = {
                id: generatedAiMsgId,
                text: safeFinalText,
                type: 'ai-msg',
                isFavorite: false,
                created_at: new Date().toISOString()
            };

            activeChat.messages.push(aiMessage);
            window.chatStore.saveToStorage();

            // Инкремент лимита
            if (window.userStore && !window.userStore.hasUnlimited()) {
                window.userStore.incrementUsage();
            }

            // ✅ Если синхронизация включена (PRO) — отправляем на сервер
            if (window.userStore && window.userStore.canSync() && activeChat.id) {
                if (window.messageService) {
                    window.messageService.sendMessage(activeChat.id, safeFinalText, 'ai-msg', {
                        isFavorite: false,
                        id: generatedAiMsgId
                    }).catch(err => {
                        console.error('Синхронизация AI ответа не удалась:', err);
                    });
                }
            }
        } else {
            console.warn('⚠️ Пустой ответ от сервера');
            if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage('⚠️ Сервер вернул пустой ответ.', 'ai-msg');
            }
        }
        return true;

    } catch (err) {
        console.error('❌ Критический сбой стрима:', err);
        if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();

        if (msgDiv && accumulatedText.trim().length > 0) {
            const disconnectNotice = `${accumulatedText}\n\n[⚠️ Соединение разорвано]`;
            if (typeof marked !== 'undefined') {
                try {
                    let rawHTML = marked.parse(disconnectNotice);
                    if (typeof DOMPurify !== 'undefined') {
                        msgDiv.innerHTML = DOMPurify.sanitize(rawHTML);
                    } else {
                        msgDiv.innerHTML = rawHTML;
                    }
                } catch {
                    msgDiv.textContent = disconnectNotice;
                }
            } else {
                msgDiv.textContent = disconnectNotice;
            }

            // Сохраняем частичный ответ локально
            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            msgDiv.id = `msg-block-${generatedAiMsgId}`;

            const safeFinalText = typeof disconnectNotice === 'string' ? disconnectNotice : String(disconnectNotice);

            // Добавляем действия
            const act = document.createElement('div');
            act.className = 'msg-actions';
            act.innerHTML = `
                <button class="action-btn" data-tooltip="📋" onclick="window.chatSend.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
                <button class="action-btn" data-tooltip="🔗" onclick="window.chatSend.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
                <button class="action-btn" onclick="window.chatSend.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
                <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.chatSend.deleteMessage('${generatedAiMsgId}')">🗑️</button>
            `;
            msgDiv.appendChild(act);

            const aiMessage = {
                id: generatedAiMsgId,
                text: safeFinalText,
                type: 'ai-msg',
                isFavorite: false,
                created_at: new Date().toISOString()
            };

            activeChat.messages.push(aiMessage);
            window.chatStore.saveToStorage();

            // Инкремент лимита (если есть)
            if (window.userStore && !window.userStore.hasUnlimited()) {
                window.userStore.incrementUsage();
            }
        } else {
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    }
};

console.log('✅ ChatStream v3.0 загружен (упрощенная версия)');
