window.toggleVoiceRecording = async function(btn) {
    const userInput = document.getElementById('user-input');
    const sendBtn = document.querySelector('.send-btn');
    const clearBtn = document.getElementById('clear-input-btn');
    const timerEl = document.getElementById('voice-timer');
    const tg = window.Telegram?.WebApp;
    if (window.isSendingMessage) return;

    const resetVoiceUI = () => {
        if (window.voiceInterval) clearInterval(window.voiceInterval);
        if (window.voiceTimeout) clearTimeout(window.voiceTimeout);
        if (timerEl) { timerEl.classList.add('hidden'); timerEl.innerText = '30s'; }
        btn.classList.remove('recording-active'); btn.disabled = false;
        if (userInput) userInput.disabled = false; if (sendBtn) sendBtn.disabled = false;
    };

    if (window.isVoiceRecording) {
        window.isVoiceRecording = false;
        if (window.mediaRecorder && window.mediaRecorder.state !== "inactive") window.mediaRecorder.stop();
        return;
    }

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (tg && tg.showAlert) tg.showAlert("Голосовой ввод не поддерживается устройством."); return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        window.audioChunks = []; window.isVoiceRecording = true; window.maxVolumeDetected = -100;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        window.audioContext = new AudioContext();
        const source = window.audioContext.createMediaStreamSource(stream);
        const analyser = window.audioContext.createAnalyser();
        analyser.fftSize = 256; source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);

        const checkVolume = () => {
            if (!window.isVoiceRecording) return;
            analyser.getFloatFrequencyData(dataArray);
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > window.maxVolumeDetected) window.maxVolumeDetected = dataArray[i];
            }
            requestAnimationFrame(checkVolume);
        };
        checkVolume();

        if (timerEl) {
            timerEl.classList.remove('hidden'); let timeLeft = 15; timerEl.innerText = `${timeLeft}s`;
            window.voiceInterval = setInterval(() => {
                timeLeft--; timerEl.innerText = `${timeLeft}s`;
                if (timeLeft <= 0) clearInterval(window.voiceInterval);
            }, 1000);
        }

        window.voiceTimeout = setTimeout(() => {
            if (window.isVoiceRecording) { window.isExpressVoiceTarget = false; window.toggleVoiceRecording(btn); }
        }, 15000);

        if (userInput) { userInput.disabled = true; userInput.placeholder = "Слушаю вас... Говорите"; }
        btn.classList.add('recording-active');
        
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options = MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : {};
        }
        
        window.mediaRecorder = new MediaRecorder(stream, options);
        window.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) window.audioChunks.push(e.data); };
         window.mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            const isExpress = !!window.isExpressVoiceTarget; window.isExpressVoiceTarget = false;

            if (window.maxVolumeDetected < -48) {
                resetVoiceUI();
                if (userInput) { userInput.disabled = false; userInput.placeholder = "Ваш вопрос..."; }
                if (isExpress && typeof window.expandInputArea === 'function') window.expandInputArea();
                return;
            }

            btn.disabled = true;
            if (userInput) userInput.placeholder = isExpress ? "Экспресс-отправка..." : "Обработка аудиофайла...";
            if (isExpress) {
                if (typeof window.collapseInputArea === 'function') window.collapseInputArea();
            }

            // Шлем на бэкенд чистый, стабильный нативный оригинал без хирургического вмешательства
            let audioBlob = new Blob(window.audioChunks, options.mimeType ? { type: options.mimeType } : {});

            try {
                const response = await fetch('/api/chat/whisper', {
                    method: 'POST', body: audioBlob,
                    headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Type': audioBlob.type }
                });
                const data = await response.json();
                resetVoiceUI(); if (userInput) userInput.placeholder = "Ваш вопрос...";

                if (data.error || !data.text || data.text.trim().length === 0) {
                    if (isExpress) {
                        if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                        if (typeof window.renderMessageToDOM === 'function') {
                            window.renderMessageToDOM(`⚠️ Ошибка расшифровки: ${data.error || "Голос не распознан"}`, 'ai-msg');
                        }
                    } else if (tg && tg.showAlert) { tg.showAlert(`Не удалось распознать: ${data.error || "пустой ответ"}`); }
                    return;
                }

                const finalCleanText = data.text.trim();

                if (isExpress) {
                    if (userInput) { userInput.value = ''; userInput.style.height = 'auto'; }
                    if (clearBtn) clearBtn.classList.add('hidden');

                    if (typeof window.addMessageToStorage === 'function') window.addMessageToStorage(finalCleanText, 'user-msg');
                    if (typeof window.showSkeleton === 'function') window.showSkeleton();
                    const activeChat = (window.chatHistories[window.currentModel] || []).find(c => c.id === window.activeChatIds[window.currentModel]);
                    const maxLimit = activeChat ? (activeChat.maxContext || 15) : 15;
                    const cleanHist = (activeChat ? activeChat.messages.slice(-maxLimit) : []).map(m => ({ type: String(m.type), text: String(m.text) }));
                    
                    window.isSendingMessage = true; if (userInput) userInput.disabled = true;
                    const vBtn = document.querySelector('.voice-btn'); if (vBtn) vBtn.disabled = true;
                    if (sendBtn) sendBtn.disabled = true;

                    if (typeof window.streamAiResponse === 'function') {
                        await window.streamAiResponse(cleanHist, window.allUserKeys[window.currentModel], activeChat);
                    }
                    window.isSendingMessage = false; if (userInput) userInput.disabled = false;
                    if (vBtn) vBtn.disabled = false; if (sendBtn) sendBtn.disabled = false;
                } else {
                    if (userInput) {
                        userInput.value = finalCleanText; userInput.style.height = 'auto';
                        userInput.style.height = (userInput.scrollHeight) + 'px';
                        if (clearBtn) clearBtn.classList.remove('hidden'); userInput.focus();
                    }
                }
            } catch (err) {
                console.error("Ошибка сети Whisper:", err); resetVoiceUI(); if (userInput) userInput.placeholder = "Ваш вопрос...";
                if (isExpress) {
                    if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
                    if (typeof window.renderMessageToDOM === 'function') window.renderMessageToDOM(`⚠️ Сбой сети при расшифровке аудио`, 'ai-msg');
                }
            }
        };
        window.mediaRecorder.start();
    } catch (err) {
        console.error("Ошибка микрофона:", err); window.isVoiceRecording = false; resetVoiceUI();
        if (userInput) { userInput.disabled = false; userInput.placeholder = "Ваш вопрос..."; }
        if (tg && tg.showAlert) tg.showAlert("Доступ к микрофону отклонен.");
    }
};
