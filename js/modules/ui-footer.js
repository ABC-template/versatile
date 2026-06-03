document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('user-input');
    const inputArea = document.getElementById('input-area');
    const chatContainer = document.getElementById('chat-container');
    const fabBtn = document.getElementById('fab-open-input');
    const overlay = document.getElementById('input-overlay');
    const clearBtn = document.getElementById('clear-input-btn');
    const tg = window.Telegram?.WebApp;
    
    if (userInput && inputArea && chatContainer && fabBtn && overlay && clearBtn) {
        
        if (navigator.virtualKeyboard) {
            navigator.virtualKeyboard.overlaysContent = false;
        }

        const resizeTextArea = () => {
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            
            // Динамический показ/скрытие крестика очистки
            if (userInput.value.trim().length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        };

        userInput.addEventListener('input', resizeTextArea);

        // ЗАЩИТА ПУСТОГО ПРОСТРАНСТВА: Клик внутри капсулы не закрывает её
        inputArea.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // КНОПКА МОМЕНТАЛЬНОЙ ОЧИСТКИ (ЧЕРНОВИК СБРАСЫВАЕТСЯ)
        window.clearUserText = function(e) {
            if (e) e.stopPropagation();
            userInput.value = '';
            userInput.style.height = 'auto';
            clearBtn.classList.add('hidden');
            userInput.focus();
        };

                // ВЫДВИЖЕНИЕ КАПСУЛЫ (ЧАТ СЗАДИ ПОЛНОСТЬЮ СТАТИЧЕН)
        window.expandInputArea = function() {
            fabBtn.style.opacity = '0';
            fabBtn.style.pointerEvents = 'none';
            
            overlay.classList.remove('hidden'); 
            inputArea.classList.add('active');
            
            if (userInput.value.length > 0) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
            
            resizeTextArea();
            userInput.focus();

            // Блок setTimeout с принудительным скроллом чата полностью удален!
            
            if (tg?.BackButton) {
                tg.BackButton.show();
                tg.BackButton.offClick();
                tg.BackButton.onClick(() => { window.collapseInputArea(); });
            }
        };


        // СЖАТИЕ КАПСУЛЫ (ЧЕРНОВИК СОХРАНЯЕТСЯ)
        window.collapseInputArea = function() {
            if (window.isVoiceRecording) return; // Голосовой замок

            userInput.blur();
            inputArea.classList.remove('active');
            inputArea.classList.remove('keyboard-up');
            overlay.classList.add('hidden'); // Убираем размытый фон
            
            // Строка очистки userInput.value убрана! Текст остаётся внутри как черновик.

            fabBtn.style.opacity = '1';
            fabBtn.style.pointerEvents = 'auto';
            
            if (tg?.BackButton) tg.BackButton.hide();
        };

        // Клик по размытому внешнему фону закрывает капсулу
        overlay.addEventListener('click', () => {
            window.collapseInputArea();
        });

        // СТАРАЯ ФУНКЦИЯ BLUR ПОЛНОСТЬЮ УДАЛЕНА: Капсула стоит намертво, фокус не улетает
        
        if (tg) {
            try {
                tg.onEvent('viewportChanged', () => {
                    if (!inputArea.classList.contains('active')) return;
                    const isKeyboardOpen = window.innerHeight < tg.viewportStableHeight;
                    if (isKeyboardOpen) {
                        inputArea.classList.add('keyboard-up');
                    } else {
                        inputArea.classList.remove('keyboard-up');
                    }
                });
            } catch (err) {
                console.error("Ошибка контроля вьюпорта в капсуле:", err);
            }
        }
    }
});
