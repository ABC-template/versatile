// ============================================
// js/modules/chat/stream.js
// Описание: Стриминг ответов от ИИ (ОРИГИНАЛ)
// Версия: 1.0.0 (возврат к исходной рабочей версии)
// ============================================

console.log('✅ ChatStream загружен');

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
    let isFirstChunk = true;
    
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
        
        // ==========================================
        // ✅ ОРИГИНАЛЬНЫЙ ПАРСИНГ (РАБОТАЕТ)
        // ==========================================
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
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
                            
                            if (isFirstChunk && accumulatedText.trim().length > 0) {
                                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
                                
                                msgDiv = document.createElement('div');
                                msgDiv.className = 'msg ai-msg msg-animated';
                                msgDiv.id = `msg-block-${Date.now()}-${Math.random()}`;
                                msgDiv.setAttribute('data-sanitized', 'true');
                                container.appendChild(msgDiv);
                                isFirstChunk = false;
                            }
                            
                            if (msgDiv && !isFirstChunk) {
                                if (typeof marked !== 'undefined') {
                                    try {
                                        let rawHTML = marked.parse(accumulatedText);
                                        if (typeof DOMPurify !== 'undefined') {
                                            rawHTML = DOMPurify.sanitize(rawHTML, {
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
                                        msgDiv.innerHTML = rawHTML;
                                    } catch (markErr) {
                                        console.warn('Ошибка marked:', markErr);
                                        msgDiv.textContent = accumulatedText;
                                    }
                                } else {
                                    msgDiv.textContent = accumulatedText;
                                }
                                container.scrollTop = container.scrollHeight;
                            }
                        }
                    } catch (e) {
                        // Игнорируем
                    }
                }
            }
        }
        
        // ==========================================
        // ✅ ФИНАЛИЗАЦИЯ (ОРИГИНАЛ)
        // ==========================================
        if (accumulatedText.trim().length > 0) {
            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            
            if (msgDiv) {
                msgDiv.id = `msg-block-${generatedAiMsgId}`;
            } else {
                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
                msgDiv = uiRenderer.renderMessage(accumulatedText, 'ai-msg', generatedAiMsgId);
            }
            
            const safeFinalText = typeof accumulatedText === 'string' ? accumulatedText : String(accumulatedText);
            
            // Добавляем действия
            if (msgDiv) {
                const act = document.createElement('div');
                act.className = 'msg-actions';
                act.innerHTML = `
                    <button class="action-btn" data-tooltip="📋" onclick="window.chatSend.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
                    <button class="action-btn" data-tooltip="🔗" onclick="window.chatSend.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
                    <button class="action-btn" onclick="window.chatSend.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
                    <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.chatSend.deleteMessage('${generatedAiMsgId}')">🗑️</button>
                `;
                msgDiv.appendChild(act);
            }
            
            if (activeChat) {
                const aiMessage = {
                    id: generatedAiMsgId,
                    text: safeFinalText,
                    type: 'ai-msg',
                    isFavorite: false,
                    synced: false,
                    created_at: new Date().toISOString()
                };
                
                activeChat.messages.push(aiMessage);
                window.chatStore.saveToStorage();
                
                if (window.userStore && !window.userStore.hasUnlimited()) {
                    window.userStore.incrementUsage();
                }
                
                if (window.userStore && window.userStore.canSync() && activeChat.id) {
                    if (window.messageService) {
                        window.messageService.sendMessage(activeChat.id, safeFinalText, 'ai-msg', {
                            synced: false,
                            isFavorite: false
                        }).catch(err => {
                            console.error('Синхронизация AI ответа не удалась:', err);
                        });
                    }
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
        } else {
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    }
};

console.log('✅ ChatStream загружен (оригинальная версия)');
