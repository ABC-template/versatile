// js /modules /ui.js (Часть 1 из 3)

// 1. НАВИГАЦИЯ: Управление вкладками модального окна профиля (Изолированное)
window.openModalTab = function(tabName) {
    const card = document.getElementById('profile-card');
    const keyArea = document.getElementById('dynamic-key-area');
    if (tabName === 'organizer') {
    if (keyArea) keyArea.style.display = 'none'; // Скрываем подвал в органайзере
    // Запускаем рендеринг хаба, если функции модулей готовы
    if (typeof window.renderTodoModule === 'function') window.renderTodoModule();
    if (typeof window.renderSchedulerModule === 'function') window.renderSchedulerModule();
    if (typeof window.renderTrackerModule === 'function') window.renderTrackerModule();
    }
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

// 2. ИЗБРАННОЕ: Сборка глобального списка
window.renderGlobalFavorites = function() {
    const container = document.getElementById('global-favorites-list');
    if (!container) return; 
    container.innerHTML = ''; 
    let hasFav = false;

    Object.keys(window.chatHistories).forEach(tId => {
        (window.chatHistories[tId] || []).forEach(chat => {
            if (chat && chat.messages) {
                chat.messages.forEach((msg) => {
                    if (msg.isFavorite) {
                        hasFav = true; 
                        const favItem = document.createElement('div');
                        favItem.className = 'chat-history-item';
                        favItem.style.cssText = 'background:var(--secondary-bg); padding:12px; border-radius:12px; cursor:pointer; font-size:13px; text-align:left; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:10px;';
                        
                        const cleanText = msg.text.replace(/[#*`]/g, '');
                        const shortText = cleanText.length > 70 ? cleanText.substring(0, 70) + '...' : cleanText;
                        
                        const contentDiv = document.createElement('div');
                        contentDiv.style.flex = '1';
                        contentDiv.style.overflow = 'hidden';
                        contentDiv.innerHTML = `
                            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--hint-color); margin-bottom:4px; font-weight:600;">
                                <span>🤖 ${window.topicNames[tId]||tId}</span>
                                <span>📂 ${chat.title}</span>
                            </div>
                            <div style="color:var(--text-color); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shortText}</div>
                        `;
                        
                        contentDiv.onclick = () => {
                            window.currentTopic = tId; 
                            window.activeChatIds[tId] = chat.id; 
                            window.saveHistoriesToLocal();
                            if (typeof window.selectTopic === 'function') window.selectTopic(tId);
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
                        unfavBtn.title = window.getLangString('confirm_unfav');
                        
                        unfavBtn.onclick = (e) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            
                            const actionUnfav = () => {
                                msg.isFavorite = false; 
                                window.saveHistoriesToLocal(); 
                                
                                const liveMsgBlock = document.getElementById(`msg-block-${msg.id}`);
                                if (liveMsgBlock) {
                                    const heartBtn = liveMsgBlock.querySelector('.action-btn.is-favorite') || liveMsgBlock.querySelector('.action-btn:last-child');
                                    const heartSpan = heartBtn ? heartBtn.querySelector('.icon-heart') : null;
                                    
                                    if (heartBtn) {
                                        heartBtn.classList.remove('is-favorite');
                                        heartBtn.setAttribute('data-tooltip', '🤍');
                                        if (heartSpan) heartSpan.innerText = '🤍';
                                    }
                                }
                                
                                favItem.style.transition = 'all 0.25s ease';
                                favItem.style.opacity = '0';
                                favItem.style.transform = 'scale(0.95)';
                                setTimeout(() => { window.renderGlobalFavorites(); }, 250);
                            };

                            if (window.tg?.showConfirm) {
                                window.tg.showConfirm(window.getLangString('confirm_unfav'), (ok) => { if (ok) actionUnfav(); });
                            } else if (confirm(window.getLangString('confirm_unfav'))) {
                                actionUnfav();
                            }
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
        container.innerHTML = `<p style="font-size:12px; color:var(--hint-color); text-align:center; margin-top:20px;">${window.getLangString('no_fav')}</p>`;
    }
};

// 3. ДИАЛОГИ: Рендеринг списка чатов в меню профиля
window.renderHistoryChatsList = function() {
    const listContainer = document.getElementById('history-chats-list');
    if (!listContainer) return; 
    listContainer.innerHTML = '';
    
    const modelsChats = window.chatHistories[window.currentTopic] || [];
    const currentActiveId = window.activeChatIds[window.currentTopic];
    
    modelsChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-history-item ${chat.id === currentActiveId ? 'active' : ''}`;
        chatItem.setAttribute('onclick', `window.switchActiveChat('${chat.id}')`);
        
        chatItem.innerHTML = `
            <span class="chat-title-text"></span>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="delete-chat-btn" style="opacity:0.7;" onclick="window.renameChat(event, '${chat.id}')">✏️</button>
                <button class="delete-chat-btn" onclick="window.deleteChat(event, '${chat.id}')">🗑️</button>
            </div>
        `;
        chatItem.querySelector('.chat-title-text').innerText = chat.title;
        listContainer.appendChild(chatItem);
    });
};
// js /modules /ui.js (Часть 2 из 3)

// 4. ТЕМЫ: Переключатель карточек направлений
window.renderModelSwitcher = function() {
    document.querySelectorAll('.model-chip').forEach(chip => {
        const topic = chip.getAttribute('data-topic');
        
        chip.onclick = () => {
            if (topic === 'analytics') {
                window.showBetaAlert();
                return;
            }
            window.selectTopic(topic);
        };
    });
};

window.selectTopic = function(topic) {
    window.currentTopic = topic;
    document.querySelectorAll('.model-chip').forEach(c => c.classList.remove('active'));
    
    const chip = document.querySelector(`.model-chip[data-topic="${topic}"]`);
    if (chip) chip.classList.add('active');
    
    const indicator = document.getElementById('chat-model-indicator');
    if (indicator) indicator.innerText = 'Versatile AI';
    
    if (!window.chatHistories[topic] || window.chatHistories[topic].length === 0) {
        window.chatHistories[topic] = [];
        window.createNewChat();
    }
    
    if (!window.activeChatIds[topic]) {
        window.activeChatIds[topic] = window.chatHistories[topic][0]?.id || null;
    }
    
    window.refreshUiAfterChatSelection();
};

// 5. СООБЩЕНИЯ: Отрисовка текста, markdown и кнопок удаления реплик
window.loadActiveChatMessages = function() {
    const container = document.getElementById('chat-container'); 
    if (!container) return; 
    container.innerHTML = '';
    
    const activeChat = window.getCurrentActiveChat();
    if (activeChat?.messages) {
        activeChat.messages.forEach((msg) => window.renderMessageToDOM(msg.text, msg.type, msg.id, msg.isFavorite));
    }
};

window.renderMessageToDOM = function(text, className, msgId = null, isFav = false) {
    const container = document.getElementById('chat-container'); 
    if (!container) return;
    
    const msgDiv = document.createElement('div'); 
    msgDiv.className = `msg ${className} msg-animated`;
    
    const finalMsgId = msgId || window.generateUUID();   // замена
    msgDiv.id = `msg-block-${finalMsgId}`;
    
    const contentContainer = document.createElement('div');
    contentContainer.style.width = '100%';
    
    if (className === 'ai-msg') {
        try {
            if (typeof marked !== 'undefined') {
                let html = marked.parse(text); 
                html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '<div class="table-wrapper"><table>$1</table></div>'); 
                contentContainer.innerHTML = html;
                
                contentContainer.querySelectorAll('pre').forEach((pre) => {
                    const codeText = pre.querySelector('code')?.innerText || pre.innerText; 
                    const wrapper = document.createElement('div'); 
                    wrapper.style.cssText = 'position:relative; width:100%;';
                    pre.parentNode.insertBefore(wrapper, pre); 
                    wrapper.appendChild(pre);
                    
                    const copyBtn = document.createElement('button'); 
                    copyBtn.className = 'code-copy-btn'; 
                    copyBtn.innerText = '📋 Копировать';
                    copyBtn.onclick = () => { 
                        navigator.clipboard.writeText(codeText).then(() => { 
                            copyBtn.innerText = '✅ Готово!'; 
                            setTimeout(() => copyBtn.innerText = '📋 Копировать', 1500); 
                        }); 
                    };
                    wrapper.appendChild(copyBtn);
                });
            } else { 
                contentContainer.innerText = text; 
            }
            
            const cText = text.trim(); 
            const isErr = cText.startsWith('⚠️ Ошибка') || cText.startsWith('Ошибка сервера') || cText.startsWith('Сбой связи') || cText.startsWith('API Error');
            const activeChat = window.getCurrentActiveChat();
            const isWelcome = activeChat && activeChat.messages[0] && activeChat.messages[0].id === finalMsgId;

            msgDiv.appendChild(contentContainer);

            if (!isErr && !isWelcome) {
                const act = document.createElement('div'); 
                act.className = 'msg-actions';
                act.innerHTML = `
                    <button class="action-btn" data-tooltip="📋" onclick="window.copyMsgText(this, '${finalMsgId}')">📋</button>
                    <button class="action-btn" data-tooltip="🔗" onclick="window.shareMsgText(this, '${finalMsgId}')">🔗</button>
                    <button class="action-btn ${isFav?'is-favorite':''}" onclick="window.toggleFavoriteMsg(this, '${finalMsgId}')"><span class="icon-heart">${isFav?'❤️':'🤍'}</span></button>
                    <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.deleteMessage('${finalMsgId}')">🗑️</button>
                `;
                msgDiv.appendChild(act);
            }
        } catch (e) { 
            msgDiv.innerText = text; 
        }
    } else { 
        msgDiv.style.position = 'relative';
        const textSpan = document.createElement('span');
        textSpan.innerText = text;
        msgDiv.appendChild(textSpan);
        
        const userDelBtn = document.createElement('button');
        userDelBtn.innerText = '🗑️';
        userDelBtn.style.cssText = 'background:transparent; border:none; outline:none; font-size:11px; cursor:pointer; margin-left:8px; opacity:0.4; padding:0; vertical-align:middle;';
        userDelBtn.onclick = (e) => {
            e.stopPropagation();
            window.deleteMessage(finalMsgId);
        };
        msgDiv.appendChild(userDelBtn);
    }
    
    container.appendChild(msgDiv); 
    container.scrollTop = container.scrollHeight;
};
// js /modules /ui.js (Часть 3 из 3)

// 6. ВСПОМОГАТЕЛЬНЫЕ ИНТЕРФЕЙСЫ
window.showSkeleton = function() {
    const container = document.getElementById('chat-container'); 
    if (!container || document.getElementById('ai-skeleton-loader')) return;
    const skDiv = document.createElement('div'); 
    skDiv.id = 'ai-skeleton-loader'; 
    skDiv.className = 'skeleton-loading';
    skDiv.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';
    container.appendChild(skDiv); 
    container.scrollTop = container.scrollHeight;
};

window.hideSkeleton = function() { 
    const sk = document.getElementById('ai-skeleton-loader'); 
    if (sk) sk.remove(); 
};

window.showGuest = function(data) {
    const gst = document.getElementById('guest-screen'); 
    const app = document.getElementById('app-screen');
    if (gst) gst.classList.remove('hidden'); 
    if (app) app.style.display = 'none';
    const t = document.getElementById('error-title'); 
    const j = document.getElementById('joke-text');
    if (t) t.innerText = data?.msg || "403"; 
    if (j) j.innerText = data?.joke || "Нужна подписка";
};

window.showChat = function() {
    const app = document.getElementById('app-screen'); 
    const header = document.getElementById('header');
    if (app) app.style.display = 'flex'; 
    if (header) header.classList.remove('hidden'); 
    window.refreshUiAfterChatSelection();
};

window.updateLimitDisplay = function() {
    const info = document.getElementById('limit-info'); 
    if (!info) return;
    const total = window.config?.dailyLimit || 0; 
    info.innerText = `${window.getLangString('limit')}: ${window.usedToday}/${total >= 9000 ? '∞' : total}`;
};

window.syncContextSliderWithActiveChat = function() {
    const slider = document.getElementById('context-slider');
    const valueLabel = document.getElementById('context-range-value');
    const helpBlock = document.getElementById('context-help-text');
    if (!slider || !valueLabel) return;

    if (helpBlock) helpBlock.classList.add('hidden'); 

    const activeChat = window.getCurrentActiveChat();
    const currentContextSize = activeChat ? (activeChat.maxContext || 15) : 15;

    slider.value = currentContextSize;
    valueLabel.innerText = currentContextSize;

    const userRole = window.config?.role || 'trial';
    const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);

    if (!hasAccess) {
        slider.disabled = true;
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'auto';
        slider.onclick = (e) => {
            e.preventDefault();
            window.showBetaAlert();
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

window.saveContextSettings = async function() {
    const slider = document.getElementById('context-slider');
    if (!slider) return;
    const userRole = window.config?.role || 'trial';
    const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);
    if (!hasAccess) {
        window.showBetaAlert();
        window.syncContextSliderWithActiveChat();
        return;
    }
    const activeChat = window.getCurrentActiveChat();
    if (activeChat) {
        activeChat.maxContext = parseInt(slider.value, 10);
        window.saveHistoriesToLocal();
        // Отправляем на сервер
        if (window.config.syncEnabled && activeChat.id) {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                try {
                    await fetch('/api/chats/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                        body: JSON.stringify({
                            action: 'update_context',
                            chatId: activeChat.id,
                            maxContext: activeChat.maxContext
                        })
                    });
                } catch (err) { console.error("Ошибка синхронизации контекста:", err); }
            }
        }
    }
};

// Единый обработчик нативной плашки Beta для всех недоступных опций и личных ключей
window.showBetaAlert = function() {
    if (window.tg?.showAlert) {
        window.tg.showAlert(window.getLangString('beta_alert'));
    } else {
        alert(window.getLangString('beta_alert'));
    }
};

// Обработчик для кликов по скрепке (📎)
window.handleAttachmentClick = function() {
    if (typeof window.triggerMediaSelector === 'function') {
        window.triggerMediaSelector();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('profile-card');
    if (card) {
        card.addEventListener('click', (e) => {
            if (e.target === card) {
                if (card.classList.contains('input-focus-mode')) {
                    if (typeof window.collapseInputArea === 'function') window.collapseInputArea();
                } else {
                    card.classList.add('hidden');
                    if (window.tg?.BackButton) window.tg.BackButton.hide();
                }
            }
        });
    }
});
// Добавить в конец файла js/modules/ui.js

// Индикатор статуса синхронизации
window.showSyncStatus = function(status, isError = false) {
    const indicator = document.getElementById('chat-model-indicator');
    if (!indicator) return;
    
    const originalText = indicator.innerText;
    
    if (status === 'syncing') {
        indicator.innerHTML = '<span style="opacity:0.7;">🔄 синхр...</span>';
        // Возвращаем исходный текст через 2 секунды
        setTimeout(() => {
            if (indicator.innerHTML === '<span style="opacity:0.7;">🔄 синхр...</span>') {
                indicator.innerText = originalText;
            }
        }, 2000);
    } else if (status === 'success') {
        indicator.innerHTML = '<span style="color: #27ae60;">✓ синхр.</span>';
        setTimeout(() => {
            if (indicator.innerHTML === '<span style="color: #27ae60;">✓ синхр.</span>') {
                indicator.innerText = originalText;
            }
        }, 1500);
    } else if (status === 'error') {
        indicator.innerHTML = '<span style="color: #e74c3c;">⚠️ офлайн</span>';
    }
};
// ==========================================
// КОРЗИНА: ОТКРЫТЬ / ЗАКРЫТЬ
// ==========================================

window.openTrashModal = function() {
    const modal = document.getElementById('trash-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        window.loadTrashItems();
    }
};

window.closeTrashModal = function() {
    const modal = document.getElementById('trash-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
};

// ==========================================
// КОРЗИНА: ЗАГРУЗИТЬ ЧАТЫ
// ==========================================

window.loadTrashItems = async function() {
    const list = document.getElementById('trash-list');
    const empty = document.getElementById('trash-empty');
    const actions = document.getElementById('trash-actions');
    const countBadge = document.getElementById('trash-count');
    
    if (!list) return;
    
    list.innerHTML = '';
    const initData = window.Telegram?.WebApp?.initData;
    
    if (!initData) {
        empty.style.display = 'block';
        empty.innerText = '❌ Нет авторизации';
        return;
    }
    
    try {
        const response = await fetch('/api/chats/trash', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        
        if (!data.success) {
            empty.style.display = 'block';
            empty.innerText = '❌ Ошибка загрузки корзины';
            return;
        }
        
        const deletedChats = data.chats || [];
        
        // Обновляем бейдж с количеством
        if (countBadge) {
            if (deletedChats.length > 0) {
                countBadge.style.display = 'inline-block';
                countBadge.innerText = deletedChats.length;
            } else {
                countBadge.style.display = 'none';
            }
        }
        
        if (deletedChats.length === 0) {
            empty.style.display = 'block';
            empty.innerText = '🗑️ Корзина пуста';
            actions.style.display = 'none';
            return;
        }
        
        empty.style.display = 'none';
        actions.style.display = 'block';
        
        // Группируем по темам
        const grouped = {};
        const topicNames = window.topicNames || {};
        
        for (const chat of deletedChats) {
            const topic = chat.topic_id || 'fast';
            if (!grouped[topic]) grouped[topic] = [];
            grouped[topic].push(chat);
        }
        
        // Сортируем темы
        const sortedTopics = Object.keys(grouped).sort();
        
        for (const topic of sortedTopics) {
            const chats = grouped[topic];
            const topicName = topicNames[topic] || topic;
            
            // Заголовок темы
            const topicHeader = document.createElement('div');
            topicHeader.style.cssText = 'font-size:12px; font-weight:600; color:var(--hint-color); margin-top:8px; margin-bottom:4px; padding-left:4px;';
            topicHeader.innerText = `📁 ${topicName} (${chats.length})`;
            list.appendChild(topicHeader);
            
            // Чаты в теме
            for (const chat of chats) {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--secondary-bg); border-radius:12px; margin-bottom:4px; animation:fadeInUp 0.2s ease;';
                
                const date = new Date(chat.deleted_at);
                const dateStr = date.toLocaleDateString('ru-RU', { day:'2-digit', month:'short', year:'numeric' });
                
                const info = document.createElement('div');
                info.style.cssText = 'flex:1; overflow:hidden; min-width:0;';
                info.innerHTML = `
                    <div style="font-weight:500; font-size:13px; color:var(--text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${chat.title || 'Без названия'}
                    </div>
                    <div style="font-size:10px; color:var(--hint-color);">
                        🗑️ ${dateStr}
                    </div>
                `;
                
                const actionsGroup = document.createElement('div');
                actionsGroup.style.cssText = 'display:flex; gap:6px; flex-shrink:0; margin-left:8px;';
                
                // Кнопка "Восстановить"
                const restoreBtn = document.createElement('button');
                restoreBtn.innerText = '↩️';
                restoreBtn.style.cssText = 'background:rgba(46,204,113,0.1); border:none; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:14px; transition:all 0.15s ease;';
                restoreBtn.title = 'Восстановить чат';
                restoreBtn.onmouseenter = () => { restoreBtn.style.transform = 'scale(1.05)'; };
                restoreBtn.onmouseleave = () => { restoreBtn.style.transform = 'scale(1)'; };
                restoreBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const confirmMsg = `Восстановить чат "${chat.title}"?`;
                    if (window.tg?.showConfirm) {
                        window.tg.showConfirm(confirmMsg, async (ok) => {
                            if (ok) await window.restoreChatFromTrash(chat.id);
                        });
                    } else if (confirm(confirmMsg)) {
                        await window.restoreChatFromTrash(chat.id);
                    }
                };
                
                // Кнопка "Удалить навсегда"
                const deleteBtn = document.createElement('button');
                deleteBtn.innerText = '🗑️';
                deleteBtn.style.cssText = 'background:rgba(231,76,60,0.1); border:none; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:14px; transition:all 0.15s ease;';
                deleteBtn.title = 'Удалить навсегда';
                deleteBtn.onmouseenter = () => { deleteBtn.style.transform = 'scale(1.05)'; };
                deleteBtn.onmouseleave = () => { deleteBtn.style.transform = 'scale(1)'; };
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const confirmMsg = `Удалить чат "${chat.title}" навсегда? Это действие необратимо!`;
                    if (window.tg?.showConfirm) {
                        window.tg.showConfirm(confirmMsg, async (ok) => {
                            if (ok) await window.permanentDeleteChat(chat.id);
                        });
                    } else if (confirm(confirmMsg)) {
                        await window.permanentDeleteChat(chat.id);
                    }
                };
                
                actionsGroup.appendChild(restoreBtn);
                actionsGroup.appendChild(deleteBtn);
                
                item.appendChild(info);
                item.appendChild(actionsGroup);
                list.appendChild(item);
            }
        }
        
    } catch (err) {
        console.error('Ошибка загрузки корзины:', err);
        empty.style.display = 'block';
        empty.innerText = '❌ Ошибка: ' + err.message;
    }
};

// ==========================================
// КОРЗИНА: ВОССТАНОВИТЬ ЧАТ
// ==========================================

window.restoreChatFromTrash = async function(chatId) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
        if (window.tg?.showAlert) window.tg.showAlert('❌ Нет авторизации');
        return;
    }
    
    try {
        const response = await fetch('/api/chats/trash', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ id: chatId, type: 'chat' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Чат ${chatId} восстановлен`);
            
            // Загружаем чат с сервера
            if (typeof window.loadFullChat === 'function') {
                await window.loadFullChat(chatId);
            }
            
            // Обновляем UI
            if (typeof window.renderHistoryChatsList === 'function') {
                window.renderHistoryChatsList();
            }
            
            // Обновляем корзину
            window.loadTrashItems();
            
            if (window.tg?.showAlert) {
                window.tg.showAlert('✅ Чат восстановлен');
            }
        } else {
            console.error('Ошибка восстановления:', data.error);
            if (window.tg?.showAlert) {
                window.tg.showAlert('❌ ' + (data.error || 'Ошибка восстановления'));
            }
        }
    } catch (err) {
        console.error('Ошибка восстановления:', err);
        if (window.tg?.showAlert) {
            window.tg.showAlert('❌ ' + err.message);
        }
    }
};

// ==========================================
// КОРЗИНА: УДАЛИТЬ НАВСЕГДА (ОДИН ЧАТ)
// ==========================================

window.permanentDeleteChat = async function(chatId) {
    const deviceFingerprint = window.getDeviceFingerprint();
    const initData = window.Telegram?.WebApp?.initData;
    
    if (!initData || !deviceFingerprint) {
        if (window.tg?.showAlert) window.tg.showAlert('❌ Нет данных для удаления');
        return;
    }
    
    try {
        const response = await fetch('/api/chats/trash', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({
                id: chatId,
                type: 'chat',
                deviceFingerprint: deviceFingerprint
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`🗑️ Чат ${chatId} удалён навсегда`);
            
            // Удаляем из локального хранилища
            for (const topic of ['code', 'creative', 'fast', 'kitchen']) {
                if (window.chatHistories[topic]) {
                    window.chatHistories[topic] = window.chatHistories[topic].filter(c => c.id !== chatId);
                }
            }
            window.saveHistoriesToLocal();
            
            // Обновляем UI
            if (typeof window.renderHistoryChatsList === 'function') {
                window.renderHistoryChatsList();
            }
            
            // Обновляем корзину
            window.loadTrashItems();
            
            if (window.tg?.showAlert) {
                window.tg.showAlert('🗑️ Чат удалён навсегда');
            }
        } else {
            console.error('Ошибка удаления:', data.error);
            if (window.tg?.showAlert) {
                window.tg.showAlert('❌ ' + (data.error || 'Ошибка удаления'));
            }
        }
    } catch (err) {
        console.error('Ошибка удаления:', err);
        if (window.tg?.showAlert) {
            window.tg.showAlert('❌ ' + err.message);
        }
    }
};

// ==========================================
// КОРЗИНА: ОЧИСТИТЬ ВСЮ КОРЗИНУ
// ==========================================

window.clearAllTrash = async function() {
    const confirmMsg1 = 'Вы уверены, что хотите очистить всю корзину?';
    const confirmMsg2 = '⚠️ Это действие необратимо! Все чаты из корзины будут удалены навсегда. Продолжить?';
    
    const doClear = () => {
        if (window.tg?.showConfirm) {
            window.tg.showConfirm(confirmMsg2, async (ok) => {
                if (ok) await window.executeClearAllTrash();
            });
        } else if (confirm(confirmMsg2)) {
            window.executeClearAllTrash();
        }
    };
    
    if (window.tg?.showConfirm) {
        window.tg.showConfirm(confirmMsg1, (ok) => {
            if (ok) doClear();
        });
    } else if (confirm(confirmMsg1)) {
        doClear();
    }
};

window.executeClearAllTrash = async function() {
    const initData = window.Telegram?.WebApp?.initData;
    const deviceFingerprint = window.getDeviceFingerprint();
    
    if (!initData || !deviceFingerprint) {
        if (window.tg?.showAlert) window.tg.showAlert('❌ Нет данных для очистки');
        return;
    }
    
    try {
        // Получаем список всех чатов в корзине
        const response = await fetch('/api/chats/trash', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await response.json();
        
        if (!data.success || !data.chats || data.chats.length === 0) {
            if (window.tg?.showAlert) window.tg.showAlert('Корзина уже пуста');
            return;
        }
        
        let deletedCount = 0;
        
        for (const chat of data.chats) {
            try {
                const delResponse = await fetch('/api/chats/trash', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initData
                    },
                    body: JSON.stringify({
                        id: chat.id,
                        type: 'chat',
                        deviceFingerprint: deviceFingerprint
                    })
                });
                
                const delData = await delResponse.json();
                if (delData.success) {
                    deletedCount++;
                    
                    // Удаляем из локального хранилища
                    for (const topic of ['code', 'creative', 'fast', 'kitchen']) {
                        if (window.chatHistories[topic]) {
                            window.chatHistories[topic] = window.chatHistories[topic].filter(c => c.id !== chat.id);
                        }
                    }
                }
            } catch (err) {
                console.error('Ошибка удаления чата:', err);
            }
        }
        
        window.saveHistoriesToLocal();
        
        // Обновляем UI
        if (typeof window.renderHistoryChatsList === 'function') {
            window.renderHistoryChatsList();
        }
        
        // Обновляем корзину
        window.loadTrashItems();
        
        if (window.tg?.showAlert) {
            window.tg.showAlert(`🗑️ Удалено ${deletedCount} чатов навсегда`);
        }
        
    } catch (err) {
        console.error('Ошибка очистки корзины:', err);
        if (window.tg?.showAlert) {
            window.tg.showAlert('❌ ' + err.message);
        }
    }
};
// ==========================================
// ОБЛАКО ТЕГОВ — РЕНДЕРИНГ
// ==========================================

window.renderTagsCloud = function() {
    const container = document.getElementById('tags-cloud-container');
    if (!container) return;
    
    // Проверяем, есть ли сохранённый чат
    const lastTopic = localStorage.getItem('last_topic');
    const hasLastChat = lastTopic && window.chatHistories[lastTopic]?.some(c => c.synced && !c.deleted_at);
    
    // Если есть последний чат — показываем кнопку "Вернуться в чат"
    let returnButton = '';
    if (hasLastChat) {
        returnButton = `
            <button class="btn" style="width:100%; padding:14px; border-radius:14px; margin-bottom:16px; background: var(--button-color); color: var(--button-text);" onclick="window.restoreLastChat()">
                ↩️ Вернуться в чат
            </button>
        `;
    }
    
    container.innerHTML = `
        <div class="tags-cloud-wrapper">
            <div class="tags-cloud-header">
                <h2>🌤️ Добро пожаловать!</h2>
                <p style="color: var(--hint-color); font-size: 14px; margin: 4px 0 16px 0;">Выбери направление для общения с ИИ:</p>
            </div>
            
            ${returnButton}
            
            <div class="tags-cloud-grid">
                <div class="tag-chip active" data-topic="code" onclick="window.switchTopic('code')">
                    <span class="tag-icon">💻</span>
                    <span class="tag-name">#кодинг</span>
                </div>
                <div class="tag-chip" data-topic="creative" onclick="window.switchTopic('creative')">
                    <span class="tag-icon">✍️</span>
                    <span class="tag-name">#креатив</span>
                </div>
                <div class="tag-chip" data-topic="fast" onclick="window.switchTopic('fast')">
                    <span class="tag-icon">⚡</span>
                    <span class="tag-name">#флуд</span>
                </div>
                <div class="tag-chip" data-topic="kitchen" onclick="window.switchTopic('kitchen')">
                    <span class="tag-icon">🍳</span>
                    <span class="tag-name">#кухня</span>
                </div>
                <div class="tag-chip" data-topic="analytics" onclick="window.switchTopic('analytics')">
                    <span class="tag-icon">📊</span>
                    <span class="tag-name">#аналитика <span style="font-size:9px; opacity:0.6;">(Beta)</span></span>
                </div>
            </div>
            
            <div class="tags-cloud-footer">
                <button class="tag-action-btn" onclick="window.openModalTab('chats')">
                    💬 История чатов
                </button>
                <button class="tag-action-btn" onclick="window.openModalTab('favorites')">
                    ⭐ Избранное
                </button>
                <button class="tag-action-btn" onclick="window.openModalTab('organizer')">
                    📅 Органайзер
                </button>
                <button class="tag-action-btn" onclick="window.openModalTab('profile')">
                    👤 Профиль
                </button>
            </div>
        </div>
    `;
};

// ==========================================
// ИСТОРИЯ ЧАТОВ С ФИЛЬТРАЦИЕЙ
// ==========================================

window.currentFilter = 'all';

window.renderHistoryChatsList = function(filterTopic) {
    const listContainer = document.getElementById('history-chats-list');
    if (!listContainer) return;
    
    const activeFilter = filterTopic || window.currentFilter || 'all';
    listContainer.innerHTML = '';
    
    // Собираем ВСЕ чаты из всех тем
    let allChats = [];
    for (const [topic, chats] of Object.entries(window.chatHistories)) {
        if (!chats) continue;
        for (const chat of chats) {
            // Пропускаем чаты в корзине (с deleted_at)
            if (chat.deleted_at) continue;
            // Пропускаем временные чаты без сообщений пользователя
            if (!chat.synced && chat.messages && chat.messages.length <= 1) continue;
            
            allChats.push({
                ...chat,
                topic: topic,
                topicDisplay: window.topicShortNames[topic] || topic
            });
        }
    }
    
    // Фильтрация по теме
    if (activeFilter !== 'all') {
        allChats = allChats.filter(chat => chat.topic === activeFilter);
    }
    
    // Сортировка по дате последнего сообщения
    allChats.sort((a, b) => {
        const aTime = a.messages && a.messages.length > 0 
            ? a.messages[a.messages.length - 1]?.created_at || a.created_at 
            : a.created_at;
        const bTime = b.messages && b.messages.length > 0 
            ? b.messages[b.messages.length - 1]?.created_at || b.created_at 
            : b.created_at;
        return new Date(bTime) - new Date(aTime);
    });
    
    if (allChats.length === 0) {
        listContainer.innerHTML = `<p style="color:var(--hint-color); text-align:center; padding:20px; font-size:13px;">Нет чатов в этом разделе</p>`;
        return;
    }
    
    for (const chat of allChats) {
        const activeMessages = (chat.messages || []).filter(m => !m.deleted_at);
        const count = activeMessages.length;
        
        const lastMsg = chat.messages && chat.messages.length > 0 
            ? chat.messages[chat.messages.length - 1] 
            : null;
        const lastTime = lastMsg?.created_at || chat.created_at;
        const timeStr = window.formatDate(lastTime);
        
        const chatItem = document.createElement('div');
        chatItem.className = `chat-history-item ${chat.id === window.activeChatIds[chat.topic] ? 'active' : ''}`;
        chatItem.setAttribute('onclick', `window.switchToChat('${chat.id}', '${chat.topic}')`);
        
        chatItem.innerHTML = `
            <div style="flex:1; overflow:hidden; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:10px; font-weight:600; color:var(--button-color); flex-shrink:0; background:rgba(var(--tg-theme-button-color,0,136,204),0.08); padding:2px 8px; border-radius:4px;">
                        ${chat.topicDisplay}
                    </span>
                    <span class="chat-title-text" style="font-weight:500; font-size:13px;">${chat.title || 'Без названия'}</span>
                </div>
                <div style="font-size:11px; color:var(--hint-color); margin-top:2px;">
                    ${count} ${window.pluralize(count, 'сообщение', 'сообщения', 'сообщений')} • ${timeStr}
                </div>
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0; margin-left:8px;">
                <button class="delete-chat-btn" style="opacity:0.6; font-size:13px;" onclick="event.stopPropagation(); window.renameChat(event, '${chat.id}')">✏️</button>
                <button class="delete-chat-btn" style="font-size:13px;" onclick="event.stopPropagation(); window.deleteChat(event, '${chat.id}')">🗑️</button>
            </div>
        `;
        listContainer.appendChild(chatItem);
    }
};

// ==========================================
// ПРИМЕНЕНИЕ ФИЛЬТРА В ИСТОРИИ
// ==========================================

window.applyChatFilter = function(topic) {
    window.currentFilter = topic;
    
    // Обновляем активный фильтр
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.topic === topic);
    });
    
    window.renderHistoryChatsList(topic === 'all' ? null : topic);
};

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ НА ЧАТ ИЗ ИСТОРИИ
// ==========================================

window.switchToChat = function(chatId, topic) {
    // Закрываем модалку
    const card = document.getElementById('profile-card');
    if (card) card.classList.add('hidden');
    if (window.tg?.BackButton) window.tg.BackButton.hide();
    
    // Переключаем тему и чат
    if (window.currentTopic !== topic) {
        window.currentTopic = topic;
        // Обновляем активный чип в облаке тегов
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
    }
    
    window.activeChatIds[topic] = chatId;
    window.saveHistoriesToLocal();
    window.refreshUiAfterChatSelection();
    
    // Сохраняем последний чат
    localStorage.setItem('last_topic', topic);
    localStorage.setItem(`last_chat_${topic}`, chatId);
};

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

window.formatDate = function(dateStr) {
    if (!dateStr) return 'неизвестно';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) {
        return 'сегодня ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff === 1) {
        return 'вчера ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7) {
        return diff + ' дня назад';
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
    }
};

window.pluralize = function(count, one, two, five) {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
};

// ==========================================
// ОБНОВЛЕНИЕ СТАТУСА ОБЛАКА ТЕГОВ
// ==========================================

window.updateTagsCloud = function() {
    const container = document.getElementById('tags-cloud-container');
    if (container && !document.getElementById('app-screen')?.style.display === 'none') {
        window.renderTagsCloud();
    }
};

console.log('✅ UI: функции облака тегов и истории загружены');
console.log('✅ UI: функции корзины загружены');
