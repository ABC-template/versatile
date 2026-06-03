window.streamAiResponse = async function(cleanHistoryMessages, userKey, activeChat) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    // Создаем контроллер для возможности принудительной отмены запроса по таймауту
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд на первый ответ сервера

    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                historyMessages: cleanHistoryMessages,
                userKey: userKey || null,
                currentModel: window.currentModel
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId); // Ответ пошел, сбрасываем стартовый таймаут

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const errData = await response.json();
            if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Ошибка: ${errData.error}`, 'ai-msg');
            }
            const voiceBtn = document.querySelector('.voice-btn');
            if (voiceBtn) voiceBtn.disabled = false;
            return false;
        }

        if (!response.ok) {
            throw new Error(`Ошибка сети сервера: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let accumulatedText = '';
        let isFirstChunk = true;
        let msgIndex = activeChat ? activeChat.messages.length : Date.now();

        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ai-msg msg-animated`;
        msgDiv.id = `msg-block-${window.currentModel}-${msgIndex}`;
        
        // Внутренний цикл чтения с контролем сетевого залипания между чанками
        while (true) {
            // Запускаем гонку: либо чанк прочитан, либо сработает таймаут (12 секунд ожидания)
            const chunkTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Превышено время ожидания ответа от сети')), 12000)
            );
            
            const readPromise = reader.read();
            const { done, value } = await Promise.race([readPromise, chunkTimeout]);
            
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;

            if (isFirstChunk && accumulatedText.trim().length > 0) {
                if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                container.appendChild(msgDiv);
                isFirstChunk = false;
            }

            // Рендеринг с автозакрытием незавершенных Markdown тегов
            let renderText = accumulatedText;
            const codeBlockCount = (renderText.match(/```/g) || []).length;
            if (codeBlockCount % 2 !== 0) {
                renderText += '\n```'; // Временно закрываем блок кода для marked
            }

            if (typeof marked !== 'undefined') {
                let html = marked.parse(renderText);
                html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '<div class="table-wrapper"><table>$1</table></div>');
                msgDiv.innerHTML = html;
            } else {
                msgDiv.innerText = renderText;
            }

            container.scrollTop = container.scrollHeight;
        }

        // Завершение в штатном режиме
        if (accumulatedText.trim().length > 0) {
            finalizeStreamMessage(msgDiv, accumulatedText, activeChat);
        }
        return true;

    } catch (err) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой стрима:", err);
        
        // Обработка обрыва связи (если текст уже частично был получен)
        const partialText = msgDiv ? msgDiv.innerText || accumulatedText : '';
        if (partialText.trim().length > 0) {
            const disconnectNotice = `${accumulatedText}\n\n[⚠️ Соединение разорвано. Пожалуйста, повторите запрос]`;
            
            if (typeof marked !== 'undefined') {
                msgDiv.innerHTML = marked.parse(disconnectNotice);
            } else {
                msgDiv.innerText = disconnectNotice;
            }
            
            finalizeStreamMessage(msgDiv, disconnectNotice, activeChat);
        } else {
            // Если упало еще до первого чанка
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Сбой потоковой передачи: Интернет-соединение прервано`, 'ai-msg');
            }
        }
        return false;
    }
};

// Выносим финализацию в чистую подфункцию, чтобы не дублировать логику при ошибке
function finalizeStreamMessage(msgDiv, finalText, activeChat) {
    const generatedAiMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    msgDiv.id = `msg-block-${generatedAiMsgId}`;

    const act = document.createElement('div');
    act.className = 'msg-actions';
    act.innerHTML = `
        <button class="action-btn" data-tooltip="Скопировано!" onclick="window.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
        <button class="action-btn" data-tooltip="Ссылка создана!" onclick="window.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
        <button class="action-btn" onclick="window.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
    `;
    msgDiv.appendChild(act);

    if (activeChat) {
        activeChat.messages.push({ 
            id: generatedAiMsgId, 
            text: finalText, 
            type: 'ai-msg' 
        });
        window.saveHistoriesToLocal();
    }
    
    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && typeof window.incrementUsage === 'function') {
        window.incrementUsage();
    }
}
