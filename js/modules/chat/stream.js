// ============================================
// js/modules/chat/stream.js
// Описание: Стриминг ответов от ИИ (убрано дублирование)
// Версия: 2.0.1
// ============================================

console.log('✅ ChatStream v2.0.1 загружен');

// Флаг для предотвращения дублирования
let isStreaming = false;
let currentStreamId = null;

window.streamAiResponse = async function(historyMessages, topic, userLang, attachedImage, activeChat) {
    // Защита от дублирования
    const streamId = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (isStreaming) {
        console.warn('⚠️ Стрим уже выполняется, пропускаем дублирующий вызов');
        return false;
    }
    
    isStreaming = true;
    currentStreamId = streamId;
    
    console.log(`🎯 streamAiResponse вызвана (ID: ${streamId})`);
    console.log('📸 Есть фото?', !!attachedImage);
    
    const container = document.getElementById('chat-container');
    if (!container) {
        console.error('❌ chat-container не найден');
        isStreaming = false;
        return false;
    }
    
    const uiRenderer = window.uiRenderer;
    const chatStore = window.chatStore;
    
    let msgDiv = null;
    let accumulatedText = '';
    let isFirstChunk = true;
    let isCompleted = false;
    
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
                                msgDiv.id = `msg-block-stream-${streamId}`;
                                msgDiv.setAttribute('data-sanitized', 'true');
                                container.appendChild(msgDiv);
                                isFirstChunk = false;
                            }
                            
                            // Обновляем содержимое
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
                                        console.warn('Ошибка marked, используем textContent:', markErr);
                                        msgDiv.textContent = accumulatedText;
                                    }
                                } else {
                                    msgDiv.textContent = accumulatedText;
                                }
                                container.scrollTop = container.scrollHeight;
                            }
                        }
                    } catch (e) {
                        // Игнорируем невалидный JSON
                    }
                }
            }
        }
        
        isCompleted = true;
        
        if (accumulatedText.trim().length > 0) {
            // Финальное сохранение
            if (msgDiv) {
                finalizeStreamMessage(msgDiv, accumulatedText, activeChat, streamId);
            } else {
                // Если по какой-то причине msgDiv не создан, но текст есть
                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
                const finalMsg = uiRenderer.renderMessage(accumulatedText, 'ai-msg');
                if (finalMsg) {
                    finalizeStreamMessage(finalMsg, accumulatedText, activeChat, streamId);
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
        
        if (msgDiv && accumulatedText.trim().length > 0 && !isCompleted) {
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
            finalizeStreamMessage(msgDiv, disconnectNotice, activeChat, streamId);
        } else if (!isCompleted) {
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    } finally {
        isStreaming = false;
        currentStreamId = null;
    }
};

/**
 * Финальная обработка сообщения (без дублирования)
 */
function finalizeStreamMessage(msgDiv, finalText, activeChat, streamId) {
    const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
    
    // Проверяем, не было ли уже сохранено это сообщение (по ID)
    if (activeChat) {
        const exists = activeChat.messages.some(m => m.id === generatedAiMsgId);
        if (exists) {
            console.warn('⚠️ Сообщение с таким ID уже существует, пропускаем');
            return;
        }
    }
    
    msgDiv.id = `msg-block-${generatedAiMsgId}`;
    
    const safeFinalText = typeof finalText === 'string' ? finalText : String(finalText);
    
    // Добавляем действия
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
            synced: false,
            created_at: new Date().toISOString()
        };
        
        activeChat.messages.push(aiMessage);
        window.chatStore.saveToStorage();
        
        // Инкремент лимита
        if (window.userStore && !window.userStore.hasUnlimited()) {
            window.userStore.incrementUsage();
        }
        
        // Синхронизация с сервером (если включена)
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
        
        console.log(`✅ AI-сообщение ${generatedAiMsgId} сохранено (стрим ${streamId})`);
    }
}

// ============================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

window.deleteMessage = function(msgId) {
    const activeChat = window.chatStore?.getActiveChat();
    if (!activeChat) return;
    
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_msg') : 'Удалить это сообщение?';
    
    const action = () => {
        if (window.messageService) {
            window.messageService.deleteMessage(activeChat.id, msgId);
        }
        
        // Удаляем из DOM
        const domBlock = document.getElementById(`msg-block-${msgId}`);
        if (domBlock) {
            domBlock.style.transition = 'all 0.25s ease';
            domBlock.style.opacity = '0';
            domBlock.style.transform = 'scale(0.95)';
            setTimeout(() => domBlock.remove(), 250);
        }
    };
    
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg, (ok) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

window.copyMsgText = function(btn, msgId) {
    const found = window.chatStore?.findChat(msgId);
    let msg = null;
    
    if (found) {
        const { chat } = found;
        msg = chat.messages.find(m => m.id === msgId);
    }
    
    if (!msg) return;
    
    navigator.clipboard.writeText(msg.text).then(() => {
        btn.classList.add('show-tip');
        setTimeout(() => btn.classList.remove('show-tip'), 1200);
    }).catch(() => {
        if (window.tg?.showAlert) window.tg.showAlert('Ошибка копирования');
    });
};

window.shareMsgText = function(btn, msgId) {
    const found = window.chatStore?.findChat(msgId);
    let msg = null;
    
    if (found) {
        const { chat } = found;
        msg = chat.messages.find(m => m.id === msgId);
    }
    
    if (!msg) return;
    
    const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(msg.text)}`;
    btn.classList.add('show-tip');
    setTimeout(() => btn.classList.remove('show-tip'), 1200);
    
    setTimeout(() => {
        if (window.tg?.openTelegramLink) {
            window.tg.openTelegramLink(shareUrl);
        } else {
            window.open(shareUrl, '_blank');
        }
    }, 300);
};

window.toggleFavoriteMsg = async function(btn, msgId) {
    const activeChat = window.chatStore?.getActiveChat();
    if (!activeChat) return;
    
    const result = await window.messageService?.toggleFavorite(activeChat.id, msgId);
    
    if (result) {
        const heartSpan = btn.querySelector('.icon-heart');
        if (result.isFavorite) {
            btn.classList.add('is-favorite');
            if (heartSpan) heartSpan.textContent = '❤️';
            btn.setAttribute('data-tooltip', '❤️');
        } else {
            btn.classList.remove('is-favorite');
            if (heartSpan) heartSpan.textContent = '🤍';
            btn.setAttribute('data-tooltip', '🤍');
        }
        btn.classList.add('show-tip');
        setTimeout(() => btn.classList.remove('show-tip'), 1200);
    }
};

console.log('✅ ChatStream v2.0.1 загружен');
