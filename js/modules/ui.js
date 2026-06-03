// 1. НАВИГАЦИЯ: Управление вкладками модального окна профиля (Изолированное)
window.openModalTab = function(tabName) {
    const card = document.getElementById('profile-card');
    const keyArea = document.getElementById('dynamic-key-area');
    const subKey = document.getElementById('sub-footer-key');
    const subContext = document.getElementById('sub-footer-context');
    
    if (!card) return;
    card.classList.remove('hidden');
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.add('hidden'));
    
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.classList.remove('hidden');
    
    // Адаптивное управление подвалом внутри самой модалки
    if (keyArea) {
        if (tabName === 'profile') {
            keyArea.style.display = 'block';
            if (subKey) subKey.classList.remove('hidden');
            if (subContext) subContext.classList.add('hidden');
        } else if (tabName === 'chats') {
            keyArea.style.display = 'block';
            if (subKey) subKey.classList.add('hidden');
            if (subContext) subContext.classList.remove('hidden');
            if (typeof window.syncContextSliderWithActiveChat === 'function') window.syncContextSliderWithActiveChat();
        } else {
            keyArea.style.display = 'none';
        }
    }
    
    if (tabName === 'favorites') window.renderGlobalFavorites();
    if (tabName === 'chats') window.renderHistoryChatsList();
    
    // Кнопка Назад Telegram перехватывает закрытие профиля
    if (window.tg?.BackButton) {
        window.tg.BackButton.show();
        window.tg.BackButton.offClick();
        window.tg.BackButton.onClick(() => { 
            card.classList.add('hidden'); 
            window.tg.BackButton.hide(); 
        });
    }
};

// Перехват клика по темному фону (оверлею) строго для закрытия профиля
document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('profile-card');
    if (card) {
        card.addEventListener('click', (e) => {
            if (e.target === card) {
                card.classList.add('hidden');
                if (window.tg?.BackButton) window.tg.BackButton.hide();
            }
        });
    }
});

// 2. ИЗБРАННОЕ: Сборка глобального списка с мгновенной синхронизацией цвета в чате
window.renderGlobalFavorites = function() {
    const container = document.getElementById('global-favorites-list');
    if (!container) return; 
    container.innerHTML = ''; 
    let hasFav = false;

    Object.keys(window.chatHistories).forEach(mId => {
        (window.chatHistories[mId] || []).forEach(chat => {
            if (chat && chat.messages) {
                chat.messages.forEach((msg) => {
                    if (msg.isFavorite) {
                        hasFav = true; 
                        const favItem = document.createElement('div');
                        favItem.className = 'chat-history-item';
                        favItem.style.cssText = 'background:var(--secondary-bg); padding:12px; border-radius:12px; cursor:pointer; font-size:13px; text-align:left; margin-bottom:6px; display:flex; align-items:center; justify-content:between; gap:10px;';
                        
                        const cleanText = msg.text.replace(/[#*`]/g, '');
                        const shortText = cleanText.length > 70 ? cleanText.substring(0, 70) + '...' : cleanText;
                        
                        const contentDiv = document.createElement('div');
                        contentDiv.style.flex = '1';
                        contentDiv.style.overflow = 'hidden';
                        contentDiv.innerHTML = `
                            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--hint-color); margin-bottom:4px; font-weight:600;">
                                <span>🤖 ${window.modelNames[mId]||mId}</span>
                                <span>📂 ${chat.title}</span>
                            </div>
                            <div style="color:var(--text-color); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shortText}</div>
                        `;
                        
                        contentDiv.onclick = () => {
                            window.currentModel = mId; 
                            window.activeChatIds[mId] = chat.id; 
                            window.saveHistoriesToLocal();
                            if (typeof window.selectModel === 'function') window.selectModel(mId);
                            document.getElementById('profile-card').classList.add('hidden'); 
                            if (window.tg?.BackButton) window.tg.BackButton.hide();
                            
                            setTimeout(() => {
                                const chatCont = document.getElementById('chat-container'); 
                                const target = document.getElementById(`msg-block-${msg.id}`);
                                if (chatCont && target) {
                                    chatCont.scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: 'smooth' });
                                    target.style.transition = 'background 0.5s'; 
                                    target.style.background = 'rgba(var(--tg-theme-button-color,0,136,204),0.15)';
                                    setTimeout(() => target.style.background = '', 1500);
                                }
                            }, 300);
                        };
                        
                        const unfavBtn = document.createElement('button');
                        unfavBtn.className = 'delete-chat-btn';
                        unfavBtn.style.fontSize = '14px';
                        unfavBtn.style.padding = '4px 6px';
                        unfavBtn.innerText = '❤️';
                        unfavBtn.title = 'Убрать из избранного';
                        
                        unfavBtn.onclick = (e) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            
                            msg.isFavorite = false; 
                            window.saveHistoriesToLocal(); 
                            
                            const liveMsgBlock = document.getElementById(`msg-block-${msg.id}`);
                            if (liveMsgBlock) {
                                const heartBtn = liveMsgBlock.querySelector('.action-btn.is-favorite') || liveMsgBlock.querySelector('.action-btn:last-child');
                                const heartSpan = heartBtn ? heartBtn.querySelector('.icon-heart') : null;
                                
                                if (heartBtn) {
                                    heartBtn.classList.remove('is-favorite');
                                    heartBtn.setAttribute('data-tooltip', 'Удалено!');
                                    if (heartSpan) heartSpan.innerText = '🤍';
                                }
                            }
                            
                            favItem.style.transition = 'all 0.25s ease';
                            favItem.style.opacity = '0';
                            favItem.style.transform = 'scale(0.95)';
                            
                            setTimeout(() => {
                                window.renderGlobalFavorites(); 
                            }, 250);
                        };
                        
                        favItem.appendChild(contentDiv);
                        favItem.appendChild(unfavBtn);
                        container.appendChild(favItem);
                    }
                });
            }
        });
    });
    
    if (!hasFav) {
        container.innerHTML = '<p style="font-size:12px; color:var(--hint-color); text-align:center; margin-top:20px;">У вас пока нет избранных ответов.</p>';
    }
};

// 3. ДИАЛОГИ: Рендеринг списка чатов в меню профиля
window.renderHistoryChatsList = function() {
    const listContainer = document.getElementById('history-chats-list');
    if (!listContainer) return; listContainer.innerHTML = '';
    const modelsChats = window.chatHistories[window.currentModel] || [];
    const currentActiveId = window.activeChatIds[window.currentModel];
    modelsChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-history-item ${chat.id === currentActiveId ? 'active' : ''}`;
        chatItem.setAttribute('onclick', `window.switchActiveChat('${chat.id}')`);
        chatItem.innerHTML = `<span class="chat-title-text"></span><button class="delete-chat-btn" onclick="window.deleteChat(event, '${chat.id}')">🗑️</button>`;
        chatItem.querySelector('.chat-title-text').innerText = chat.title;
        listContainer.appendChild(chatItem);
    });
};
// 4. МОДЕЛИ: Переключатель ИИ-вкладок и инициализация стартового чата
window.renderModelSwitcher = function() {
    document.querySelectorAll('.model-chip').forEach(chip => {
        const model = chip.getAttribute('data-model');
        const hasServerKey = window.config?.serverModels?.[model] === true;
        const hasUserKey = window.allUserKeys[model] && window.allUserKeys[model].trim().length > 0;
        chip.onclick = () => {
            if (chip.classList.contains('disabled')) {
                if (window.tg?.showAlert) window.tg.showAlert("Эта модель недоступна. Добавьте личный ключ в профиле."); return;
            }
            window.selectModel(model);
        };
        if (!hasServerKey && !hasUserKey) chip.classList.add('disabled'); else chip.classList.remove('disabled');
    });
};

window.selectModel = function(model) {
    const chip = document.querySelector(`.model-chip[data-model="${model}"]`);
    if (chip && chip.classList.contains('disabled')) return;
    window.currentModel = model;
    document.querySelectorAll('.model-chip').forEach(c => c.classList.remove('active'));
    if (chip) chip.classList.add('active');
    const indicator = document.getElementById('chat-model-indicator');
    if (indicator) indicator.innerText = window.modelNames[model] || model;
    const label = document.getElementById('key-label'); const input = document.getElementById('profile-api-key-input');
    if (label) label.innerText = `Ваш личный ключ для ${window.modelNames[model] || model}:`;
    if (input) { input.value = window.allUserKeys[model] || ''; input.placeholder = `Вставьте ${window.modelNames[model] || model} API Key`; }
    if (!window.chatHistories[model] || window.chatHistories[model].length === 0) {
        window.chatHistories[model] = []; const startChatId = "chat_" + Date.now();
        window.chatHistories[model].push({ id: startChatId, title: "Стартовый чат", messages: [{ text: window.welcomeTexts[model] || `Привет!`, type: "ai-msg" }] });
        window.activeChatIds[model] = startChatId; if (typeof window.saveHistoriesToLocal === 'function') window.saveHistoriesToLocal();
    }
    if (!window.activeChatIds[model]) window.activeChatIds[model] = window.chatHistories[model]?.id;
    window.renderHistoryChatsList(); window.loadActiveChatMessages();
    if (typeof window.updateContextButtonDisplay === 'function') window.updateContextButtonDisplay();
};
// 5. СООБЩЕНИЯ: Отрисовка текста, markdown и фиксированных кнопок копирования кода
window.loadActiveChatMessages = function() {
    const container = document.getElementById('chat-container'); if (!container) return; container.innerHTML = '';
    const activeChat = (window.chatHistories[window.currentModel] || []).find(c => c.id === window.activeChatIds[window.currentModel]);
    if (activeChat?.messages) activeChat.messages.forEach((msg) => window.renderMessageToDOM(msg.text, msg.type, msg.id, msg.isFavorite));
};

window.renderMessageToDOM = function(text, className, msgId = null, isFav = false) {
    const container = document.getElementById('chat-container'); if (!container) return;
    const msgDiv = document.createElement('div'); msgDiv.className = `msg ${className} msg-animated`;
    
    // Если id не передан (например, временный рендеринг), генерируем локальный
    const finalMsgId = msgId || "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    msgDiv.id = `msg-block-${finalMsgId}`;
    
    if (className === 'ai-msg') {
        try {
            if (typeof marked !== 'undefined') {
                let html = marked.parse(text); html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '<div class="table-wrapper"><table>$1</table></div>'); msgDiv.innerHTML = html;
                msgDiv.querySelectorAll('pre').forEach((pre) => {
                    const codeText = pre.querySelector('code')?.innerText || pre.innerText; const wrapper = document.createElement('div'); wrapper.style.position = 'relative'; wrapper.style.width = '100%';
                    pre.parentNode.insertBefore(wrapper, pre); wrapper.appendChild(pre);
                    const copyBtn = document.createElement('button'); copyBtn.className = 'code-copy-btn'; copyBtn.innerText = '📋 Копировать';
                    copyBtn.onclick = () => { navigator.clipboard.writeText(codeText).then(() => { copyBtn.innerText = '✅ Готово!'; setTimeout(() => copyBtn.innerText = '📋 Копировать', 1500); }); };
                    wrapper.appendChild(copyBtn);
                });
            } else { msgDiv.innerText = text; }
            const cText = text.trim(); const isErr = cText.startsWith('⚠️ Ошибка') || cText.startsWith('Ошибка сервера') || cText.startsWith('Сбой связи') || cText.startsWith('API Error');
            
            // Исключаем экшены для приветственного сообщения (оно всегда идет первым в созданном чате и не имеет экшенов)
            const activeChat = (window.chatHistories[window.currentModel] || []).find(c => c.id === window.activeChatIds[window.currentModel]);
            const isWelcome = activeChat && activeChat.messages[0] && activeChat.messages[0].id === finalMsgId;

            if (!isErr && !isWelcome) {
                const act = document.createElement('div'); act.className = 'msg-actions';
                act.innerHTML = `<button class="action-btn" data-tooltip="Скопировано!" onclick="window.copyMsgText(this, '${finalMsgId}')">📋</button><button class="action-btn" data-tooltip="Ссылка создана!" onclick="window.shareMsgText(this, '${finalMsgId}')">🔗</button><button class="action-btn ${isFav?'is-favorite':''}" onclick="window.toggleFavoriteMsg(this, '${finalMsgId}')"><span class="icon-heart">${isFav?'❤️':'🤍'}</span></button>`;
                msgDiv.appendChild(act);
            }
        } catch (e) { msgDiv.innerText = text; }
    } else { msgDiv.innerText = text; }
    container.appendChild(msgDiv); container.scrollTop = container.scrollHeight;
};

// 6. ВСПОМОГАТЕЛЬНЫЕ ИНТЕРФЕЙСЫ: Скелетоны, лимиты, гостевой экран и оверлей
window.showSkeleton = function() {
    const container = document.getElementById('chat-container'); if (!container || document.getElementById('ai-skeleton-loader')) return;
    const skDiv = document.createElement('div'); skDiv.id = 'ai-skeleton-loader'; skDiv.className = 'skeleton-loading';
    skDiv.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';
    container.appendChild(skDiv); container.scrollTop = container.scrollHeight;
};
window.hideSkeleton = function() { const sk = document.getElementById('ai-skeleton-loader'); if (sk) sk.remove(); };
window.showGuest = function(data) {
    const gst = document.getElementById('guest-screen'); const app = document.getElementById('app-screen');
    if (gst) gst.classList.remove('hidden'); if (app) app.style.display = 'none';
    const t = document.getElementById('error-title'); const j = document.getElementById('joke-text');
    if (t) t.innerText = data?.msg || "403"; if (j) j.innerText = data?.joke || "Нужна подписка";
};
window.showChat = function() {
    const app = document.getElementById('app-screen'); const header = document.getElementById('header');
    if (app) app.style.display = 'flex'; if (header) header.classList.remove('hidden'); window.updateLimitDisplay();
    const prem = document.getElementById('profile-premium-area');
    if (prem) { if (Object.keys(window.allUserKeys).length > 0 && window.config?.role !== 'premium' && window.config?.role !== 'admin') prem.classList.remove('hidden'); else prem.classList.add('hidden'); }
};
window.updateLimitDisplay = function() {
    const info = document.getElementById('limit-info'); if (!info) return;
    const total = window.config?.dailyLimit || 0; info.innerText = `Лимит: ${window.usedToday}/${total >= 9000 ? '∞' : total}`;
};
// ЖЕСТКАЯ СИНХРОНИЗАЦИЯ ПОЛЗУНКА С УЧЕТОМ РОЛИ ПОЛЬЗОВАТЕЛЯ
window.syncContextSliderWithActiveChat = function() {
    const slider = document.getElementById('context-slider');
    const valueLabel = document.getElementById('context-range-value');
    const helpBlock = document.getElementById('context-help-text');
    if (!slider || !valueLabel) return;

    if (helpBlock) helpBlock.classList.add('hidden');

    const modelsChats = window.chatHistories[window.currentModel] || [];
    const currentActiveId = window.activeChatIds[window.currentModel];
    const activeChat = modelsChats.find(c => c.id === currentActiveId);
    
    const currentContextSize = activeChat ? (activeChat.maxContext || 15) : 15;

    slider.value = currentContextSize;
    valueLabel.innerText = currentContextSize;

    // Проверка прав доступа для блокировки элемента
    const userRole = window.config?.role || 'trial';
    const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);

    if (!hasAccess) {
        slider.disabled = true;
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'auto'; // Позволяет перехватывать клики на disabled элементе через обертку, либо обрабатывать onclick
        
        // Вешаем уведомление прямо на контейнер или подменяем поведение
        slider.onclick = (e) => {
            e.preventDefault();
            if (window.tg?.showAlert) window.tg.showAlert("Данная опция находится в разработке");
        };
    } else {
        slider.disabled = false;
        slider.style.opacity = '1';
        slider.onclick = null;
    }
};

window.toggleContextHelp = function(event) {
    if (event) event.stopPropagation();
    const helpBlock = document.getElementById('context-help-text');
    if (helpBlock) helpBlock.classList.toggle('hidden');
};

window.onContextSliderChange = function(val) {
    const valueLabel = document.getElementById('context-range-value');
    if (valueLabel) valueLabel.innerText = val;
};

window.saveContextSettings = function() {
    const slider = document.getElementById('context-slider');
    if (!slider) return;

    const userRole = window.config?.role || 'trial';
    const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);

    if (!hasAccess) {
        if (window.tg?.showAlert) {
            window.tg.showAlert("Данная опция находится в разработке");
        }
        window.syncContextSliderWithActiveChat();
        return;
    }

    const modelsChats = window.chatHistories[window.currentModel] || [];
    const currentActiveId = window.activeChatIds[window.currentModel];
    const activeChat = modelsChats.find(c => c.id === currentActiveId);

    if (activeChat) {
        activeChat.maxContext = parseInt(slider.value, 10);
        window.saveHistoriesToLocal();
    }
};
// Найдите этот блок в самом низу index.html (или в ui.js) и замените его логику:
document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('profile-card');
    // Замените блок клика по оверлею в самом низу js/modules/ui.js на этот:
    if (card) {
        card.addEventListener('click', (e) => {
            if (e.target === card) {
                // Если сейчас открыт режим ввода, то клик по фону сворачивает капсулу
                if (card.classList.contains('input-focus-mode')) {
                    if (typeof window.collapseInputArea === 'function') {
                        window.collapseInputArea();
                    }
                } else {
                    // Если открыт обычный профиль — просто закрываем его
                    card.classList.add('hidden');
                    if (window.tg?.BackButton) window.tg.BackButton.hide();
                }
            }
        });
    }

});
