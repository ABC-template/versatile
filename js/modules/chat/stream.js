// ============================================
// js/modules/chat/stream.js
// Описание: Стриминг ответов от ИИ (С ЛОГИРОВАНИЕМ)
// Версия: 3.0.1 (debug)
// ============================================

console.log('✅ ChatStream v3.0.1 загружен');

// ГЛОБАЛЬНЫЙ СЧЕТЧИК ВЫЗОВОВ
let streamCallCounter = 0;

window.streamAiResponse = async function(historyMessages, topic, userLang, attachedImage, activeChat) {
    // Уникальный ID вызова
    const callId = ++streamCallCounter;
    console.log(`🔴 [СТРИМ #${callId}] ===== НАЧАЛО =====`);
    console.log(`🔴 [СТРИМ #${callId}] topic: ${topic}, userLang: ${userLang}, history: ${historyMessages?.length || 0} сообщений`);
    console.log(`🔴 [СТРИМ #${callId}] activeChat: ${activeChat?.id || 'null'}, messages: ${activeChat?.messages?.length || 0}`);

    const container = document.getElementById('chat-container');
    if (!container) {
        console.error(`❌ [СТРИМ #${callId}] chat-container не найден`);
        return false;
    }

    const uiRenderer = window.uiRenderer;
    const chatStore = window.chatStore;

    let msgDiv = null;
    let accumulatedText = '';
    let isFirstChunk = true;
    let chunksReceived = 0;
    let finalizeCalled = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn(`⏰ [СТРИМ #${callId}] Таймаут 60 секунд истек`);
        controller.abort();
    }, 60000);

    try {
        const requestBody = {
            historyMessages: historyMessages || [],
            currentTopic: topic || chatStore.currentTopic,
            userLang: userLang || 'ru',
            attachedImage: attachedImage || null
        };

        console.log(`🌊 [СТРИМ #${callId}] Отправляем запрос к /api/chat/stream`);

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

        console.log(`📡 [СТРИМ #${callId}] Ответ: status ${response.status}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`❌ [СТРИМ #${callId}] Ошибка ${response.status}: ${text.substring(0, 200)}`);
            throw new Error(`Ошибка ${response.status}: ${text.substring(0, 200)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        console.log(`📡 [СТРИМ #${callId}] Начинаем чтение стрима...`);

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log(`📡 [СТРИМ #${callId}] Стрим завершен, получено ${chunksReceived} чанков`);
                break;
            }

            chunksReceived++;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            console.log(`📦 [СТРИМ #${callId}] Чанк #${chunksReceived}: ${chunk.length} байт`);
            console.log(`📦 [СТРИМ #${callId}] Содержимое чанка: "${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}"`);

            // Разбираем строки
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                console.log(`📄 [СТРИМ #${callId}] Строка: "${trimmedLine.substring(0, 80)}${trimmedLine.length > 80 ? '...' : ''}"`);
                
                if (trimmedLine.startsWith('data: ')) {
                    const jsonStr = trimmedLine.slice(6).trim();
                    console.log(`📄 [СТРИМ #${callId}] JSON: "${jsonStr.substring(0, 100)}${jsonStr.length > 100 ? '...' : ''}"`);
                    
                    if (jsonStr === '[DONE]') {
                        console.log(`📄 [СТРИМ #${callId}] Получен [DONE] маркер`);
                        continue;
                    }

                    try {
                        const data = JSON.parse(jsonStr);
                        console.log(`📄 [СТРИМ #${callId}] Парсинг успешен, keys: ${Object.keys(data).join(', ')}`);
                        
                        const content = data.choices?.[0]?.delta?.content;
                        console.log(`📄 [СТРИМ #${callId}] content: "${content?.substring(0, 50) || 'null'}"`);
                        
                        if (content) {
                            accumulatedText += content;
                            console.log(`📝 [СТРИМ #${callId}] Добавлено ${content.length} символов (всего: ${accumulatedText.length})`);

                            if (isFirstChunk && accumulatedText.trim().length > 0) {
                                console.log(`🎨 [СТРИМ #${callId}] Первый чанк, создаем DOM`);
                                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
                                container.appendChild(msgDiv);
                                isFirstChunk = false;
                            }

                            if (msgDiv && !isFirstChunk) {
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
                                        console.warn(`⚠️ [СТРИМ #${callId}] Ошибка marked:`, markErr);
                                        msgDiv.textContent = accumulatedText;
                                    }
                                } else {
                                    msgDiv.textContent = accumulatedText;
                                }
                                container.scrollTop = container.scrollHeight;
                            }
                        } else {
                            console.warn(`⚠️ [СТРИМ #${callId}] content отсутствует в чанке`);
                        }
                    } catch (e) {
                        console.warn(`⚠️ [СТРИМ #${callId}] Ошибка парсинга JSON:`, e.message);
                    }
                } else {
                    console.log(`📄 [СТРИМ #${callId}] Строка без data: префикса (игнорируем)`);
                }
            }
        }

        console.log(`📊 [СТРИМ #${callId}] Итог: ${chunksReceived} чанков, ${accumulatedText.length} символов`);
        console.log(`📊 [СТРИМ #${callId}] finalizeCalled: ${finalizeCalled}`);

        // ✅ Упрощенно: сохраняем AI-сообщение
        if (accumulatedText.trim().length > 0) {
            console.log(`🟢 [СТРИМ #${callId}] НАЧАЛО ФИНАЛИЗАЦИИ`);
            
            if (finalizeCalled) {
                console.warn(`⚠️⚠️⚠️ [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ВЫЗВАНА ПОВТОРНО! Пропускаем.`);
                return true;
            }
            finalizeCalled = true;

            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            console.log(`🟢 [СТРИМ #${callId}] Сгенерирован ID: ${generatedAiMsgId}`);
            
            msgDiv.id = `msg-block-${generatedAiMsgId}`;
            console.log(`🟢 [СТРИМ #${callId}] Обновлен ID DOM элемента`);

            const safeFinalText = typeof accumulatedText === 'string' ? accumulatedText : String(accumulatedText);
            console.log(`🟢 [СТРИМ #${callId}] Текст: "${safeFinalText.substring(0, 80)}..."`);

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
            console.log(`🟢 [СТРИМ #${callId}] Добавлены кнопки действий`);

            // ✅ Сохраняем локально (всегда)
            console.log(`💾 [СТРИМ #${callId}] СОХРАНЕНИЕ В LOCALSTORAGE`);
            console.log(`💾 [СТРИМ #${callId}] activeChat.messages ДО: ${activeChat?.messages?.length || 0}`);
            
            const aiMessage = {
                id: generatedAiMsgId,
                text: safeFinalText,
                type: 'ai-msg',
                isFavorite: false,
                created_at: new Date().toISOString()
            };

            activeChat.messages.push(aiMessage);
            window.chatStore.saveToStorage();
            
            console.log(`💾 [СТРИМ #${callId}] activeChat.messages ПОСЛЕ: ${activeChat?.messages?.length || 0}`);

            // Инкремент лимита
            if (window.userStore && !window.userStore.hasUnlimited()) {
                window.userStore.incrementUsage();
                console.log(`📊 [СТРИМ #${callId}] Инкремент лимита`);
            }

            // ✅ Если синхронизация включена (PRO) — отправляем на сервер
            if (window.userStore && window.userStore.canSync() && activeChat.id) {
                console.log(`☁️ [СТРИМ #${callId}] ОТПРАВКА НА СЕРВЕР (PRO)`);
                if (window.messageService) {
                    console.log(`☁️ [СТРИМ #${callId}] Вызов messageService.sendMessage с ID: ${generatedAiMsgId}`);
                    window.messageService.sendMessage(activeChat.id, safeFinalText, 'ai-msg', {
                        isFavorite: false,
                        id: generatedAiMsgId
                    }).catch(err => {
                        console.error(`❌ [СТРИМ #${callId}] Синхронизация AI ответа не удалась:`, err);
                    });
                }
            } else {
                console.log(`⏭️ [СТРИМ #${callId}] Синхронизация пропущена (TRIAL или нет ID чата)`);
            }
            
            console.log(`🟢 [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ЗАВЕРШЕНА`);
            
        } else {
            console.warn(`⚠️ [СТРИМ #${callId}] Пустой ответ от сервера`);
            if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage('⚠️ Сервер вернул пустой ответ.', 'ai-msg');
            }
        }
        
        console.log(`🔴 [СТРИМ #${callId}] ===== КОНЕЦ =====`);
        return true;

    } catch (err) {
        console.error(`❌❌❌ [СТРИМ #${callId}] КРИТИЧЕСКИЙ СБОЙ:`, err);
        console.error(`❌❌❌ [СТРИМ #${callId}] Стек:`, err.stack);
        
        if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();

        if (msgDiv && accumulatedText.trim().length > 0 && !finalizeCalled) {
            console.log(`🟡 [СТРИМ #${callId}] Восстановление после ошибки`);
            finalizeCalled = true;
            
            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            msgDiv.id = `msg-block-${generatedAiMsgId}`;
            
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

            const safeFinalText = typeof disconnectNotice === 'string' ? disconnectNotice : String(disconnectNotice);

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
            console.log(`💾 [СТРИМ #${callId}] Частичный ответ сохранен (ID: ${generatedAiMsgId})`);

            if (window.userStore && !window.userStore.hasUnlimited()) {
                window.userStore.incrementUsage();
            }
        } else if (!finalizeCalled) {
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    }
};

console.log('✅ ChatStream v3.0.1 загружен (с логированием)');
