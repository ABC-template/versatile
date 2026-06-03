// js /modules /net-stream.js

window.streamAiResponse = async function(cleanHistoryMessages, userKey, activeChat) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    try {
        // Запрашиваем наш новый единый стрим-роут
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                historyMessages: cleanHistoryMessages,
                userKey: userKey || null,
                currentModel: window.currentModel
            })
        });

        // Если сервер вернул JSON ошибку вместо стрима
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const errData = await response.json();
            if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
            if (typeof window.renderMessageToDOM === 'function') {
                window.renderMessageToDOM(`⚠️ Ошибка: ${errData.error}`, 'ai-msg');
            }
            // Размораживаем диктофон в случае ошибки бэкенда
            const voiceBtn = document.querySelector('.voice-btn');
            if (voiceBtn) voiceBtn.disabled = false;
            return false;
        }

        if (!response.ok) {
            throw new Error(`Ошибка сети сервера: ${response.statusText}`);
        }

        // ЧИТАЕМ СТРИМ ИЗ СЕТЕВОГО ПОТОКА БАЙТ
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let accumulatedText = '';
        let isFirstChunk = true;
        let msgIndex = activeChat ? activeChat.messages.length : Date.now();

        // Создаем пустой каркас сообщения в DOM
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ai-msg msg-animated`;
        msgDiv.id = `msg-block-${window.currentModel}-${msgIndex}`;
        
        // Цикл посимвольного/построчного чтения данных из Vercel Edge
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;

            // Как только прилетел первый символ — мгновенно прячем скелетон
            if (isFirstChunk && accumulatedText.trim().length > 0) {
                if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                container.appendChild(msgDiv); // Монтируем блок в чат
                isFirstChunk = false;
            }

            // Наполняем блок текстом в реальном времени
            if (typeof marked !== 'undefined') {
                // Если marked подключен, парсим markdown на лету
                let html = marked.parse(accumulatedText);
                html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '<div class="table-wrapper"><table>$1</table></div>');
                msgDiv.innerHTML = html;
            } else {
                msgDiv.innerText = accumulatedText;
            }

            // Умный автоскролл: держим пользователя внизу экрана, пока ИИ пишет
            container.scrollTop = container.scrollHeight;
        }

        // СТРИМИНГ ЗАВЕРШЕН СУПЕР-УСПЕШНО
        // Навешиваем финальные экшены (Копировать, Сердечко) на готовое сообщение
        if (accumulatedText.trim().length > 0) {
            const generatedAiMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
            // Обновляем ID самого блока в DOM, чтобы к нему можно было скроллиться из избранного
            msgDiv.id = `msg-block-${generatedAiMsgId}`;

            const act = document.createElement('div');
            act.className = 'msg-actions';
            act.innerHTML = `
                <button class="action-btn" data-tooltip="Скопировано!" onclick="window.copyMsgText(this, '${generatedAiMsgId}')">📋</button>
                <button class="action-btn" data-tooltip="Ссылка создана!" onclick="window.shareMsgText(this, '${generatedAiMsgId}')">🔗</button>
                <button class="action-btn" onclick="window.toggleFavoriteMsg(this, '${generatedAiMsgId}')"><span class="icon-heart">🤍</span></button>
            `;
            msgDiv.appendChild(act);

            // Сохраняем сгенерированный ответ в историю чата устройства
            if (activeChat) {
                activeChat.messages.push({ 
                    id: generatedAiMsgId, 
                    text: accumulatedText, 
                    type: 'ai-msg' 
                });
                window.saveHistoriesToLocal();
            }
            
            // Списываем лимит
            const isNoLimit = window.config.dailyLimit >= 9000;
            if (!isNoLimit && typeof window.incrementUsage === 'function') {
                window.incrementUsage();
            }
        }
        return true;

    } catch (err) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой стрима:", err);
        if (typeof window.renderMessageToDOM === 'function') {
            window.renderMessageToDOM(`⚠️ Сбой потоковой передачи: ${err.message}`, 'ai-msg');
        }
        return false;
    }
};
