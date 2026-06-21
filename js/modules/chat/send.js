// ============================================
// js/modules/chat/send.js
// Описание: Отправка сообщений
// ============================================

class ChatSend {
    constructor() {
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.uiRenderer = window.uiRenderer;
        this.chatUI = window.chatUI;
        this.isSending = false;
    }
    
    // ==========================================
    // ОТПРАВКА СООБЩЕНИЯ
    // ==========================================
    
    async sendMessage() {
        if (this.isSending) return;
        if (window.isVoiceRecording) {
            window.isExpressVoiceTarget = true;
            const voiceBtn = document.querySelector('.voice-btn');
            if (window.toggleVoiceRecording && voiceBtn) {
                await window.toggleVoiceRecording(voiceBtn);
            }
            return;
        }
        
        const input = document.getElementById('user-input');
        if (!input) return;
        
        let text = input.value.trim();
        if (!text) return;
        
        // Проверка лимитов
        if (!this.userStore.hasUnlimited() && !this.userStore.hasRemainingQuota()) {
            if (window.tg?.showAlert) window.tg.showAlert('Ежедневный лимит запросов исчерпан!');
            return;
        }
        
        this.isSending = true;
        input.disabled = true;
        
        const voiceBtn = document.querySelector('.voice-btn');
        if (voiceBtn) voiceBtn.disabled = true;
        
        // Проверка на прикрепленное изображение
        const mediaToAttach = window.currentAttachedImageBase64 || null;
        if (mediaToAttach) {
            text = `📸 [Прикреплено изображение]\n${text}`;
        }
        
        // Добавляем сообщение пользователя
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) {
            this.isSending = false;
            return;
        }
        
        // ✅ РЕНДЕРИМ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ СРАЗУ
        if (this.uiRenderer) {
            this.uiRenderer.renderMessage(text, 'user-msg');
        }
        
        // Отправляем в сервис (сохраняет в хранилище)
        const msg = await window.messageService.sendMessage(
            activeChat.id,
            text,
            'user-msg'
        );
        
        // Очищаем инпут
        input.value = '';
        input.style.height = 'auto';
        const clearBtn = document.getElementById('clear-input-btn');
        if (clearBtn) clearBtn.classList.add('hidden');
        
        if (window.collapseInputArea) window.collapseInputArea();
        if (document.activeElement === input) input.blur();
        
        // Показываем скелетон
        this.uiRenderer.showSkeleton();
        
        // Отправляем в AI
        const maxContextLimit = activeChat ? (activeChat.maxContext || 15) : 15;
        const contextMessages = this.chatStore.getContextMessages(activeChat.id, maxContextLimit);
        const cleanHistoryMessages = contextMessages.map(msg => ({
            type: String(msg.type),
            text: String(msg.text)
        }));
        
        try {
            if (typeof window.streamAiResponse === 'function') {
                const userLang = activeChat.language || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
                await window.streamAiResponse(
                    cleanHistoryMessages,
                    this.chatStore.currentTopic,
                    userLang,
                    mediaToAttach,
                    activeChat
                );
            } else {
                throw new Error('streamAiResponse not defined');
            }
        } catch (error) {
            this.uiRenderer.hideSkeleton();
            console.error('Send error:', error);
            if (this.uiRenderer.renderMessage) {
                this.uiRenderer.renderMessage(
                    `⚠️ Сбой связи с приложением: ${error.message}`,
                    'ai-msg'
                );
            }
        } finally {
            // Очищаем медиа
            if (window.clearImageAttachment) {
                window.clearImageAttachment();
            }
            
            this.isSending = false;
            input.disabled = false;
            if (voiceBtn) voiceBtn.disabled = false;
        }
    }
    
    // ==========================================
    // КОПИРОВАНИЕ И ШАРИНГ
    // ==========================================
    
    copyMsgText(btn, msgId) {
        const found = this.chatStore.findChat(msgId);
        let msg = null;
        
        if (found) {
            const { chat } = found;
            msg = chat.messages.find(m => m.id === msgId);
        }
        
        if (!msg) return;
        
        navigator.clipboard.writeText(msg.text).then(() => {
            this.triggerTooltip(btn);
        }).catch(() => {
            if (window.tg?.showAlert) window.tg.showAlert('Ошибка копирования');
        });
    }
    
    shareMsgText(btn, msgId) {
        const found = this.chatStore.findChat(msgId);
        let msg = null;
        
        if (found) {
            const { chat } = found;
            msg = chat.messages.find(m => m.id === msgId);
        }
        
        if (!msg) return;
        
        const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(msg.text)}`;
        this.triggerTooltip(btn);
        
        setTimeout(() => {
            if (window.tg?.openTelegramLink) {
                window.tg.openTelegramLink(shareUrl);
            } else {
                window.open(shareUrl, '_blank');
            }
        }, 300);
    }
    
    triggerTooltip(btn) {
        btn.classList.add('show-tip');
        setTimeout(() => {
            btn.classList.remove('show-tip');
        }, 1200);
    }
    
    // ==========================================
    // УДАЛЕНИЕ СООБЩЕНИЯ
    // ==========================================
    
    deleteMessage(msgId) {
        const activeChat = this.chatStore.getActiveChat();
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
    }
    
    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================
    
    async toggleFavoriteMsg(btn, msgId) {
        const activeChat = this.chatStore.getActiveChat();
        if (!activeChat) return;
        
        const result = await window.messageService.toggleFavorite(activeChat.id, msgId);
        
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
            this.triggerTooltip(btn);
        }
    }
    
    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ
    // ==========================================
    
    clearUserText(e) {
        if (e) e.stopPropagation();
        const input = document.getElementById('user-input');
        const clearBtn = document.getElementById('clear-input-btn');
        
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        if (clearBtn) clearBtn.classList.add('hidden');
        if (input) input.focus();
    }
}

// Экспортируем как глобальный объект
window.ChatSend = ChatSend;
window.chatSend = new ChatSend();

console.log('✅ ChatSend загружен');
