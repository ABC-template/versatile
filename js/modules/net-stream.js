// js /modules /net-stream.js

window.streamAiResponse = async function(cleanHistoryMessages, userKey, userLang, attachedImage, activeChat) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    // ОБЯЗАТЕЛЬНО: Объявляем переменную на самом верху, чтобы она была доступна в блоке catch
    let msgDiv = null;
    let accumulatedText = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                historyMessages: cleanHistoryMessages,
                currentTopic: userKey, // На фронтенде передается ID темы
                userLang: userLang
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

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
        
        let isFirstChunk = true;
        let msgIndex = activeChat ? activeChat.messages.length : Date.now();

        // Инициализируем msgDiv строго здесь
        msgDiv = document.createElement('div');
        msgDiv.className = `msg ai-msg msg-animated`;
        msgDiv.id = `msg-block-${window.currentTopic}-${msgIndex}`;
        
        while (true) {
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

            let renderText = accumulatedText;
            const codeBlockCount = (renderText.match(/```/g) || []).length;
            if (codeBlockCount % 2 !== 0) {
                renderText += '\n```';
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

        if (accumulatedText.trim().length > 0) {
            finalizeStreamMessage(msgDiv, accumulatedText, activeChat);
        }
        return true;

    } catch (err) {
        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
        console.error("Критический сбой стрима:", err);
        
        // Теперь проверка msgDiv работает идеально и без ошибок компиляции browser'а
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
                window.renderMessageToDOM(`⚠️ Сбой потоковой передачи: Интернет-соединение прервано`, 'ai-msg');
            }
        }
        return false;
    }
};

function finalizeStreamMessage(msgDiv, finalText, activeChat) {
    const generatedAiMsgId = window.generateUUID();   // замена
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
        const aiMsg = {
            id: generatedAiMsgId,
            text: finalText,
            type: 'ai-msg',
            isFavorite: false
        };
        activeChat.messages.push(aiMsg);
        window.saveHistoriesToLocal();
        if (window.config.syncEnabled && activeChat.id) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                try {
                    await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Telegram-Init-Data': initData
                        },
                        body: JSON.stringify({
                            action: 'new_message',
                            chatId: activeChat.id,
                            message: aiMsg
                        })
                    });
                } catch (err) {
                    console.error("Ошибка отправки AI-сообщения на сервер:", err);
                }
            }
        }
    }
    const isNoLimit = window.config.dailyLimit >= 9000;
    if (!isNoLimit && typeof window.incrementUsage === 'function') {
        window.incrementUsage();
    }
}
