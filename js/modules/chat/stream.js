// ============================================
// js/modules/chat/stream.js
// Описание: Стриминг ответов от ИИ (С ТОТАЛЬНЫМ ЛОГИРОВАНИЕМ)
// Версия: 3.1.0 (debug)
// ============================================

console.log('✅ ChatStream v3.1 DEBUG загружен');

// ГЛОБАЛЬНЫЙ СЧЕТЧИК ВЫЗОВОВ
let streamCallCounter = 0;
// Хранилище активных вызовов (для отслеживания дублей)
const activeStreamCalls = new Set();

window.streamAiResponse = async function(historyMessages, topic, userLang, attachedImage, activeChat) {
    // Генерируем уникальный ID вызова
    const callId = ++streamCallCounter;
    const timestamp = Date.now();
    const callStartTime = performance.now();
    
    console.log(`🔴🔴🔴 [СТРИМ #${callId}] ===== НАЧАЛО ВЫЗОВА =====`);
    console.log(`🔴 [СТРИМ #${callId}] Время: ${new Date(timestamp).toISOString()}`);
    console.log(`🔴 [СТРИМ #${callId}] Активных вызовов: ${activeStreamCalls.size}`);
    
    // Проверяем, не запущен ли уже такой же вызов
    const callSignature = JSON.stringify({ historyMessages: historyMessages?.length, topic, userLang });
    if (activeStreamCalls.has(callSignature)) {
        console.error(`🔴🔴🔴 [СТРИМ #${callId}] ОБНАРУЖЕН ДУБЛИРУЮЩИЙ ВЫЗОВ! Сигнатура: ${callSignature}`);
        console.trace('🔴 [СТРИМ #${callId}] Стек вызовов:');
        return false;
    }
    activeStreamCalls.add(callSignature);
    
    console.log(`🔴 [СТРИМ #${callId}] historyMessages: ${historyMessages?.length || 0} сообщений`);
    console.log(`🔴 [СТРИМ #${callId}] topic: ${topic}`);
    console.log(`🔴 [СТРИМ #${callId}] userLang: ${userLang}`);
    console.log(`🔴 [СТРИМ #${callId}] attachedImage: ${!!attachedImage}`);
    console.log(`🔴 [СТРИМ #${callId}] activeChat: ${activeChat?.id || 'null'}, messages: ${activeChat?.messages?.length || 0}`);
    
    const container = document.getElementById('chat-container');
    if (!container) {
        console.error(`❌ [СТРИМ #${callId}] chat-container не найден`);
        activeStreamCalls.delete(callSignature);
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
        console.log(`🌊 [СТРИМ #${callId}] Request body:`, JSON.stringify(requestBody, null, 2));

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

        console.log(`📡 [СТРИМ #${callId}] Ответ получен, status: ${response.status}`);

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
                console.log(`📡 [СТРИМ #${callId}] Стрим завершен (done: true), получено ${chunksReceived} чанков`);
                break;
            }

            chunksReceived++;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Разбираем строки
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ')) {
                    const jsonStr = trimmedLine.slice(6).trim();
                    if (jsonStr === '[DONE]') {
                        console.log(`📡 [СТРИМ #${callId}] Получен [DONE] маркер`);
                        continue;
                    }

                    try {
                        const data = JSON.parse(jsonStr);
                        const content = data.choices?.[0]?.delta?.content;
                        if (content) {
                            accumulatedText += content;
                            console.log(`📝 [СТРИМ #${callId}] Чанк #${chunksReceived}: +${content.length} символов (всего: ${accumulatedText.length})`);

                            if (isFirstChunk && accumulatedText.trim().length > 0) {
                                console.log(`🎨 [СТРИМ #${callId}] Первый чанк, создаем DOM элемент`);
                                if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();

                                msgDiv = document.createElement('div');
                                msgDiv.className = 'msg ai-msg msg-animated';
                                msgDiv.id = `msg-block-stream-${callId}-${Date.now()}`;
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
                                        console.warn(`⚠️ [СТРИМ #${callId}] Ошибка marked:`, markErr);
                                        msgDiv.textContent = accumulatedText;
                                    }
                                } else {
                                    msgDiv.textContent = accumulatedText;
                                }
                                container.scrollTop = container.scrollHeight;
                            }
                        }
                    } catch (e) {
                        console.warn(`⚠️ [СТРИМ #${callId}] Ошибка парсинга JSON:`, e.message);
                    }
                }
            }
        }

        console.log(`📊 [СТРИМ #${callId}] Итог: ${chunksReceived} чанков, ${accumulatedText.length} символов`);
        console.log(`📊 [СТРИМ #${callId}] finalizeCalled: ${finalizeCalled}`);

        // ==========================================
        // ФИНАЛИЗАЦИЯ СООБЩЕНИЯ
        // ==========================================
        
        if (accumulatedText.trim().length > 0) {
            console.log(`🟢 [СТРИМ #${callId}] НАЧАЛО ФИНАЛИЗАЦИИ`);
            
            // Проверяем, не была ли уже вызвана финализация
            if (finalizeCalled) {
                console.warn(`⚠️⚠️⚠️ [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ВЫЗВАНА ПОВТОРНО! Пропускаем.`);
                activeStreamCalls.delete(callSignature);
                return true;
            }
            finalizeCalled = true;

            const generatedAiMsgId = window.generateUUID ? window.generateUUID() : 'msg_' + Date.now();
            console.log(`🟢 [СТРИМ #${callId}] Сгенерирован ID: ${generatedAiMsgId}`);
            
            if (msgDiv) {
                msgDiv.id = `msg-block-${generatedAiMsgId}`;
                console.log(`🟢 [СТРИМ #${callId}] Обновлен ID DOM элемента`);
            } else {
                console.warn(`⚠️ [СТРИМ #${callId}] msgDiv отсутствует, создаем через renderer`);
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
                console.log(`🟢 [СТРИМ #${callId}] Добавлены кнопки действий`);
            }

            // ==========================================
            // СОХРАНЕНИЕ В ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
            // ==========================================
            
            console.log(`💾 [СТРИМ #${callId}] СОХРАНЕНИЕ В LOCALSTORAGE`);
            console.log(`💾 [СТРИМ #${callId}] activeChat.id: ${activeChat?.id}`);
            console.log(`💾 [СТРИМ #${callId}] activeChat.messages до сохранения: ${activeChat?.messages?.length || 0}`);
            
            // Проверяем, нет ли уже такого сообщения в чате
            if (activeChat) {
                const existingMsg = activeChat.messages.find(m => m.id === generatedAiMsgId);
                if (existingMsg) {
                    console.error(`❌❌❌ [СТРИМ #${callId}] СООБЩЕНИЕ С ID ${generatedAiMsgId} УЖЕ СУЩЕСТВУЕТ!`);
                    console.error(`❌❌❌ [СТРИМ #${callId}] Это дубликат! Текст: "${safeFinalText.substring(0, 50)}..."`);
                    activeStreamCalls.delete(callSignature);
                    return true;
                }
                
                // Проверяем, нет ли сообщения с таким же текстом (за 2 секунды)
                const similarMsg = activeChat.messages.find(m => 
                    m.type === 'ai-msg' && 
                    m.text === safeFinalText &&
                    Math.abs(new Date(m.created_at) - new Date()) < 2000
                );
                if (similarMsg) {
                    console.error(`❌❌❌ [СТРИМ #${callId}] ОБНАРУЖЕН ДУБЛИКАТ ПО ТЕКСТУ! ID: ${similarMsg.id}`);
                    console.error(`❌❌❌ [СТРИМ #${callId}] Текст: "${safeFinalText.substring(0, 50)}..."`);
                    activeStreamCalls.delete(callSignature);
                    return true;
                }
            }

            const aiMessage = {
                id: generatedAiMsgId,
                text: safeFinalText,
                type: 'ai-msg',
                isFavorite: false,
                created_at: new Date().toISOString()
            };

            activeChat.messages.push(aiMessage);
            window.chatStore.saveToStorage();
            
            console.log(`💾 [СТРИМ #${callId}] Сообщение сохранено в localStorage`);
            console.log(`💾 [СТРИМ #${callId}] activeChat.messages после сохранения: ${activeChat?.messages?.length || 0}`);
            
            // Проверяем, не появился ли дубликат в хранилище
            const allAiMessages = activeChat.messages.filter(m => m.type === 'ai-msg');
            const lastTwo = allAiMessages.slice(-2);
            if (lastTwo.length === 2 && lastTwo[0].text === lastTwo[1].text) {
                console.error(`❌❌❌ [СТРИМ #${callId}] ВНИМАНИЕ! ДВА ПОСЛЕДНИХ AI-СООБЩЕНИЯ ОДИНАКОВЫЕ!`);
                console.error(`❌❌❌ [СТРИМ #${callId}] ID1: ${lastTwo[0].id}, ID2: ${lastTwo[1].id}`);
                console.error(`❌❌❌ [СТРИМ #${callId}] Текст: "${lastTwo[0].text.substring(0, 50)}..."`);
            }

            // Инкремент лимита
            if (window.userStore && !window.userStore.hasUnlimited()) {
                window.userStore.incrementUsage();
                console.log(`📊 [СТРИМ #${callId}] Инкремент лимита`);
            }

            // ==========================================
            // СИНХРОНИЗАЦИЯ С СЕРВЕРОМ (если PRO)
            // ==========================================
            
            if (window.userStore && window.userStore.canSync() && activeChat.id) {
                console.log(`☁️ [СТРИМ #${callId}] ОТПРАВКА НА СЕРВЕР (PRO)`);
                if (window.messageService) {
                    console.log(`☁️ [СТРИМ #${callId}] Вызов messageService.sendMessage с ID: ${generatedAiMsgId}`);
                    try {
                        const result = await window.messageService.sendMessage(activeChat.id, safeFinalText, 'ai-msg', {
                            isFavorite: false,
                            id: generatedAiMsgId
                        });
                        console.log(`☁️ [СТРИМ #${callId}] Результат синхронизации:`, result);
                    } catch (err) {
                        console.error(`❌ [СТРИМ #${callId}] Синхронизация AI ответа не удалась:`, err);
                    }
                } else {
                    console.warn(`⚠️ [СТРИМ #${callId}] messageService не найден`);
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
        
        const callEndTime = performance.now();
        console.log(`🔴🔴🔴 [СТРИМ #${callId}] ===== КОНЕЦ ВЫЗОВА (${(callEndTime - callStartTime).toFixed(0)}ms) =====`);
        activeStreamCalls.delete(callSignature);
        return true;

    } catch (err) {
        console.error(`❌❌❌ [СТРИМ #${callId}] КРИТИЧЕСКИЙ СБОЙ:`, err);
        console.error(`❌❌❌ [СТРИМ #${callId}] Стек:`, err.stack);
        
        if (uiRenderer.hideSkeleton) uiRenderer.hideSkeleton();

        if (msgDiv && accumulatedText.trim().length > 0 && !finalizeCalled) {
            console.log(`🟡 [СТРИМ #${callId}] Восстановление после ошибки, сохранение частичного ответа`);
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

            if (activeChat) {
                const aiMessage = {
                    id: generatedAiMsgId,
                    text: safeFinalText,
                    type: 'ai-msg',
                    isFavorite: false,
                    created_at: new Date().toISOString()
                };
                activeChat.messages.push(aiMessage);
                window.chatStore.saveToStorage();
                console.log(`💾 [СТРИМ #${callId}] Частичный ответ сохранен в localStorage (ID: ${generatedAiMsgId})`);
            }
        } else if (!finalizeCalled) {
            if (uiRenderer.renderMessage) {
                uiRenderer.renderMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        
        activeStreamCalls.delete(callSignature);
        return false;
    }
};

console.log('✅ ChatStream v3.1 DEBUG загружен');
