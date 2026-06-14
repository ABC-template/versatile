// js/modules/net-stream.js
console.log("✅ net-stream.js загружен");

window.streamAiResponse = async function(cleanHistoryMessages, userKey, userLang, attachedImage, activeChat) {
    console.log('🎯 ОРИГИНАЛЬНАЯ streamAiResponse вызвана!');
    console.log('📸 Есть фото?', !!attachedImage);
    console.log('📸 Длина фото:', attachedImage?.length);
    
    const container = document.getElementById('chat-container');
    if (!container) {
        console.error('❌ chat-container не найден');
        return false;
    }

    let msgDiv = null;
    let accumulatedText = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Увеличил таймаут до 30 секунд

    try {
        const requestBody = {
            historyMessages: cleanHistoryMessages,
            currentTopic: userKey,
            userLang: userLang,
            attachedImage: attachedImage || null
        };
        
        console.log('🌊 Отправляем запрос к /api/chat/stream');
        console.log('📦 Размер запроса:', JSON.stringify(requestBody).length);
        
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

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const errData = await response.json();
            console.error('❌ Ошибка от сервера:', errData);
            if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Ошибка: ${errData.error || 'Неизвестная ошибка'}`, 'ai-msg');
            }
            return false;
        }

        if (!response.ok) {
            throw new Error(`Ошибка сети: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let isFirstChunk = true;
        let msgIndex = activeChat ? activeChat.messages.length : Date.now();

        msgDiv = document.createElement('div');
        msgDiv.className = `msg ai-msg msg-animated`;
        msgDiv.id = `msg-block-${userKey}-${msgIndex}`;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;
            console.log('📦 Получен чанк, длина:', chunk.length, 'всего:', accumulatedText.length);

            if (isFirstChunk && accumulatedText.trim().length > 0) {
                if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                container.appendChild(msgDiv);
                isFirstChunk = false;
            }

            let renderText = accumulatedText;
            const codeBlockCount = (renderText.match(/```/g) || []).length;
            if (codeBlockCount % 2 !== 0) {
                renderText += '\n```';
            }

            if (typeof marked !== 'undefined') {
                let html = marked.parse(renderText);
                html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '<div class="table-wrapper"><tr>$1<\/div>');
                msgDiv.innerHTML = html;
            } else {
                msgDiv.innerText = renderText;
            }

            container.scrollTop = container.scrollHeight;
        }

        if (accumulatedText.trim().length > 0) {
            finalizeStreamMessage(msgDiv, accumulatedText, activeChat);
        } else {
            console.warn('⚠️ Пустой ответ от сервера');
            if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM('⚠️ Сервер вернул пустой ответ. Попробуйте еще раз.', 'ai-msg');
            }
        }
        return true;

    } catch (err) {
        console.error("❌ Критический сбой стрима:", err);
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        
        if (msgDiv && accumulatedText.trim().length > 0) {
            const disconnectNotice = `${accumulatedText}\n\n[⚠️ Соединение разорвано. Пожалуйста, повторите запрос]`;
            if (typeof marked !== 'undefined') {
                msgDiv.innerHTML = marked.parse(disconnectNotice);
            } else {
                msgDiv.innerText = disconnectNotice;
            }
            finalizeStreamMessage(msgDiv, disconnectNotice, activeChat);
        } else {
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Сбой: ${err.message || 'Неизвестная ошибка'}`, 'ai-msg');
            }
        }
        return false;
    }
};

function finalizeStreamMessage(msgDiv, finalText, activeChat) {
    const generatedAiMsgId = window.generateUUID();
    msgDiv.id = `msg-block-${generatedAiMsgId}`;

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
            text: finalText, 
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
