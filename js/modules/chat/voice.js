// ============================================
// js/modules/chat/voice.js
// Описание: Голосовой ввод
// ============================================

console.log('✅ ChatVoice загружен');

// Состояние голосовой записи
window.isVoiceRecording = false;
window.isExpressVoiceTarget = false;
window.mediaRecorder = null;
window.audioChunks = [];
window.globalVoiceStream = null;
window.audioContext = null;
window.maxVolumeDetected = -100;
window.voiceInterval = null;
window.voiceTimeout = null;

/**
 * Переключение записи голоса
 */
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
        if (timerEl) {
            timerEl.classList.add('hidden');
            timerEl.textContent = '15s';
        }
        btn.classList.remove('recording-active');
        btn.disabled = false;
        if (userInput) {
            userInput.disabled = false;
            userInput.placeholder = window.getLangString ? window.getLangString('placeholder') : 'Ваш вопрос...';
        }
        if (sendBtn) sendBtn.disabled = false;
    };
    
    if (window.isVoiceRecording) {
        window.isVoiceRecording = false;
        if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
            window.mediaRecorder.stop();
        }
        return;
    }
    
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (tg && tg.showAlert) tg.showAlert('Голосовой ввод не поддерживается устройством.');
            return;
        }
        
        // Получаем поток
        if (!window.globalVoiceStream || !window.globalVoiceStream.active) {
            window.globalVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        const stream = window.globalVoiceStream;
        window.audioChunks = [];
        window.isVoiceRecording = true;
        window.maxVolumeDetected = -100;
        
        // Аудио-контекст для анализа громкости
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        window.audioContext = new AudioContext();
        const source = window.audioContext.createMediaStreamSource(stream);
        const analyser = window.audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);
        
        const checkVolume = () => {
            if (!window.isVoiceRecording) return;
            analyser.getFloatFrequencyData(dataArray);
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > window.maxVolumeDetected) {
                    window.maxVolumeDetected = dataArray[i];
                }
            }
            requestAnimationFrame(checkVolume);
        };
        checkVolume();
        
        // Таймер
        if (timerEl) {
            timerEl.classList.remove('hidden');
            let timeLeft = 15;
            timerEl.textContent = `${timeLeft}s`;
            window.voiceInterval = setInterval(() => {
                timeLeft--;
                timerEl.textContent = `${timeLeft}s`;
                if (timeLeft <= 0) clearInterval(window.voiceInterval);
            }, 1000);
        }
        
        window.voiceTimeout = setTimeout(() => {
            if (window.isVoiceRecording) {
                window.isExpressVoiceTarget = false;
                window.toggleVoiceRecording(btn);
            }
        }, 15000);
        
        if (userInput) {
            userInput.disabled = true;
            userInput.placeholder = '🎙️...';
        }
        btn.classList.add('recording-active');
        
        // Настройка MediaRecorder
        let options = { mimeType: 'audio/wav' };
        if (!MediaRecorder.isTypeSupported('audio/wav')) {
            options = { mimeType: 'audio/webm' };
            console.warn('⚠️ WAV не поддерживается, используем WebM');
        }
        
        window.mediaRecorder = new MediaRecorder(stream, options);
        console.log('🎙️ MediaRecorder создан с типом:', options.mimeType);
        
        window.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) window.audioChunks.push(e.data);
        };
        
        window.mediaRecorder.onstop = async () => {
            // Отключаем аудио-ноды
            try {
                source.disconnect();
                analyser.disconnect();
                if (window.audioContext && window.audioContext.state !== 'closed') {
                    window.audioContext.close();
                }
            } catch (e) {
                console.warn('Ошибка очистки Web Audio API:', e);
            }
            
            const isExpress = !!window.isExpressVoiceTarget;
            window.isExpressVoiceTarget = false;
            
            if (window.maxVolumeDetected < -48) {
                resetVoiceUI();
                if (isExpress && window.expandInputArea) window.expandInputArea();
                return;
            }
            
            btn.disabled = true;
            if (userInput) userInput.placeholder = '⌛...';
            if (isExpress) {
                if (window.collapseInputArea) window.collapseInputArea();
            }
            
            let audioBlob = new Blob(window.audioChunks, { type: options.mimeType });
            
            try {
                const response = await fetch('/api/chat/whisper', {
                    method: 'POST',
                    body: audioBlob,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Audio-Type': audioBlob.type || 'audio/wav',
                        'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
                    }
                });
                
                const data = await response.json();
                resetVoiceUI();
                
                if (data.error || !data.text || data.text.trim().length === 0) {
                    if (isExpress) {
                        if (window.uiRenderer && window.uiRenderer.hideSkeleton) {
                            window.uiRenderer.hideSkeleton();
                        }
                        if (window.uiRenderer && window.uiRenderer.renderMessage) {
                            window.uiRenderer.renderMessage(`⚠️ Error: ${data.error || 'Голос не распознан'}`, 'ai-msg');
                        }
                    } else if (tg && tg.showAlert) {
                        tg.showAlert(data.error || 'пустой ответ');
                    }
                    return;
                }
                
                const finalCleanText = data.text.trim();
                
                if (isExpress) {
                    if (userInput) {
                        userInput.value = '';
                        userInput.style.height = 'auto';
                    }
                    if (clearBtn) clearBtn.classList.add('hidden');
                    
                    if (window.chatStore && window.messageService) {
                        const activeChat = window.chatStore.getActiveChat();
                        if (activeChat) {
                            await window.messageService.sendMessage(activeChat.id, finalCleanText, 'user-msg');
                        }
                    }
                    
                    if (window.uiRenderer && window.uiRenderer.showSkeleton) {
                        window.uiRenderer.showSkeleton();
                    }
                    
                    const activeChat = window.chatStore.getActiveChat();
                    const maxLimit = activeChat ? (activeChat.maxContext || 15) : 15;
                    const cleanHist = activeChat ? 
                        window.chatStore.getContextMessages(activeChat.id, maxLimit).map(m => ({ 
                            type: String(m.type), 
                            text: String(m.text) 
                        })) : [];
                    
                    window.isSendingMessage = true;
                    if (userInput) userInput.disabled = true;
                    const vBtn = document.querySelector('.voice-btn');
                    if (vBtn) vBtn.disabled = true;
                    if (sendBtn) sendBtn.disabled = true;
                    
                    if (typeof window.streamAiResponse === 'function') {
                        const userLang = activeChat?.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
                        await window.streamAiResponse(
                            cleanHist,
                            window.chatStore.currentTopic,
                            userLang,
                            null,
                            activeChat
                        );
                    }
                    
                    window.isSendingMessage = false;
                    if (userInput) userInput.disabled = false;
                    if (vBtn) vBtn.disabled = false;
                    if (sendBtn) sendBtn.disabled = false;
                } else {
                    if (userInput) {
                        userInput.value = finalCleanText;
                        userInput.style.height = 'auto';
                        userInput.style.height = (userInput.scrollHeight) + 'px';
                        if (clearBtn) clearBtn.classList.remove('hidden');
                        userInput.focus();
                    }
                }
            } catch (err) {
                console.error('Ошибка сети Whisper:', err);
                resetVoiceUI();
                if (isExpress) {
                    if (window.uiRenderer && window.uiRenderer.hideSkeleton) {
                        window.uiRenderer.hideSkeleton();
                    }
                    if (window.uiRenderer && window.uiRenderer.renderMessage) {
                        window.uiRenderer.renderMessage(`⚠️ Сбой сети: ${err.message}`, 'ai-msg');
                    }
                } else if (tg && tg.showAlert) {
                    tg.showAlert(`Ошибка: ${err.message}`);
                }
            }
        };
        
        window.mediaRecorder.start();
    } catch (err) {
        console.error('Ошибка микрофона:', err);
        window.isVoiceRecording = false;
        if (window.tg?.showAlert) window.tg.showAlert('Доступ к микрофону отклонен.');
        
        // Сброс UI
        const btn = document.querySelector('.voice-btn');
        if (btn) {
            btn.classList.remove('recording-active');
            btn.disabled = false;
        }
        const userInput = document.getElementById('user-input');
        if (userInput) {
            userInput.disabled = false;
            userInput.placeholder = window.getLangString ? window.getLangString('placeholder') : 'Ваш вопрос...';
        }
    }
};

console.log('✅ ChatVoice загружен');
