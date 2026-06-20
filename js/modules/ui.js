// js/modules/ui.js - С ИНЛАЙН-СТИЛЯМИ (ВОЗВРАЩАЕМ)
// ==========================================
// НАВИГАЦИЯ: Управление вкладками
// ==========================================

window.openModalTab = function(tabName) {
    const card = document.getElementById('profile-card');
    const keyArea = document.getElementById('dynamic-key-area');
    if (tabName === 'organizer') {
    if (keyArea) keyArea.style.display = 'none';
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
    if (window.tg?.BackButton) {
        window.tg.BackButton.show();
        window.tg.BackButton.offClick();
        window.tg.BackButton.onClick(() => { 
            card.classList.add('hidden'); 
            window.tg.BackButton.hide(); 
        });
    }
};

// ==========================================
// ИЗБРАННОЕ
// ==========================================

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

// ==========================================
// ОБЛАКО ТЕГОВ
// ==========================================

window.renderTagsCloud = function() {
    const container = document.getElementById('tags-cloud-container');
    if (!container) return;
    container.innerHTML = `
        <div class="tags-cloud-wrapper">
            <div class="tags-cloud-header">
                <h2>🌤️ Добро пожаловать!</h2>
                <p style="color: var(--hint-color); font-size: 14px; margin: 4px 0 16px 0;">Выбери направление для общения:</p>
            </div>
            <div class="tags-cloud-grid">
                <div class="tag-chip active" data-topic="code" onclick="window.handleTagClick('code')">
                    <span class="tag-icon">💻</span>
                    <span class="tag-name">#кодинг</span>
                </div>
                <div class="tag-chip" data-topic="creative" onclick="window.handleTagClick('creative')">
                    <span class="tag-icon">✍️</span>
                    <span class="tag-name">#креатив</span>
                </div>
                <div class="tag-chip" data-topic="fast" onclick="window.handleTagClick('fast')">
                    <span class="tag-icon">⚡</span>
                    <span class="tag-name">#флуд</span>
                </div>
                <div class="tag-chip" data-topic="kitchen" onclick="window.handleTagClick('kitchen')">
                    <span class="tag-icon">🍳</span>
                    <span class="tag-name">#кухня</span>
                </div>
                <div class="tag-chip" data-topic="analytics" onclick="window.handleTagClick('analytics')">
                    <span class="tag-icon">📊</span>
                    <span class="tag-name">#аналитика <span style="font-size:9px; opacity:0.6;">(Beta)</span></span>
                </div>
            </div>
        </div>
    `;
};

// ==========================================
// ОБРАБОТЧИК КЛИКА ПО ТЕГУ
// ==========================================

window.handleTagClick = function(topic) {
    window.currentTopic = topic;
    window.createTempChat();
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
    window.refreshUiAfterChatSelection();
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
    let allChats = [];
    for (const [topic, chats] of Object.entries(window.chatHistories)) {
        if (!chats) continue;
        for (const chat of chats) {
            if (chat.deleted_at) continue;
            if (!chat.synced && !window.hasRealMessages(chat)) continue;
            allChats.push({
                ...chat,
                topic: topic,
                topicDisplay: window.topicShortNames[topic] || topic
            });
        }
    }
    if (activeFilter !== 'all') {
        allChats = allChats.filter(chat => chat.topic === activeFilter);
    }
    allChats.sort((a, b) => {
        const aTime = a.messages && a.messages.length > 0 ? a.messages[a.messages.length - 1]?.created_at || a.created_at : a.created_at;
        const bTime = b.messages && b.messages.length > 0 ? b.messages[b.messages.length - 1]?.created_at || b.created_at : b.created_at;
        return new Date(bTime) - new Date(aTime);
    });
    if (allChats.length === 0) {
        listContainer.innerHTML = `<p style="color:var(--hint-color); text-align:center; padding:20px; font-size:13px;">Нет чатов в этом разделе</p>`;
        return;
    }
    for (const chat of allChats) {
        const activeMessages = (chat.messages || []).filter(m => !m.deleted_at);
        const count = activeMessages.length;
        const lastMsg = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
        const lastTime = lastMsg?.created_at || chat.created_at;
        const timeStr = window.formatDate(lastTime);
        const chatItem = document.createElement('div');
        chatItem.className = `chat-history-item ${chat.id === window.activeChatIds[chat.topic] ? 'active' : ''}`;
        chatItem.setAttribute('onclick', `window.switchToChat('${chat.id}', '${chat.topic}')`);
        chatItem.innerHTML = `
            <div style="flex:1; overflow:hidden; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:10px; font-weight:600; color:var(--button-color); flex-shrink:0; background:rgba(var(--tg-theme-button-color,0,136,204),0.08); padding:2px 8px; border-radius:4px;">${chat.topicDisplay}</span>
                    <span class="chat-title-text" style="font-weight:500; font-size:13px;">${chat.title || 'Без названия'}</span>
                </div>
                <div style="font-size:11px; color:var(--hint-color); margin-top:2px;">${count} ${window.pluralize(count, 'сообщение', 'сообщения', 'сообщений')} • ${timeStr}</div>
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
// ПРИМЕНЕНИЕ ФИЛЬТРА
// ==========================================

window.applyChatFilter = function(topic) {
    window.currentFilter = topic;
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.topic === topic);
    });
    window.renderHistoryChatsList(topic === 'all' ? null : topic);
};

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ НА ЧАТ ИЗ ИСТОРИИ
// ==========================================

window.switchToChat = function(chatId, topic) {
    const card = document.getElementById('profile-card');
    if (card) card.classList.add('hidden');
    if (window.tg?.BackButton) window.tg.BackButton.hide();
    if (window.currentTopic !== topic) {
        window.currentTopic = topic;
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
    }
    window.activeChatIds[topic] = chatId;
    window.saveHistoriesToLocal();
    window.refreshUiAfterChatSelection();
    if (typeof window.showChatInterface === 'function') {
        window.showChatInterface();
    }
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
// ЗАГРУЗКА СООБЩЕНИЙ (С ПРИВЕТСТВИЕМ)
// ==========================================

window.loadActiveChatMessages = function() {
    const container = document.getElementById('chat-container');
    if (!container) return;
    container.innerHTML = '';
    const activeChat = window.getCurrentActiveChat();
    if (!activeChat) return;
    if (!activeChat.messages || activeChat.messages.length === 0) {
        const welcomeText = window.welcomeTexts[activeChat.topic] || 'Привет! Чем могу помочь?';
        window.renderWelcomeMessage(welcomeText);
        return;
    }
    activeChat.messages.forEach((msg) => {
        if (!msg.deleted_at) {
            window.renderMessageToDOM(msg.text, msg.type, msg.id, msg.isFavorite);
        }
    });
};

// ==========================================
// РЕНДЕРИНГ ПРИВЕТСТВИЯ
// ==========================================

window.renderWelcomeMessage = function(text) {
    const container = document.getElementById('chat-container');
    if (!container) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg ai-msg welcome-msg';
    msgDiv.id = 'welcome-message';
    const contentContainer = document.createElement('div');
    contentContainer.style.width = '100%';
    if (typeof marked !== 'undefined') {
        contentContainer.innerHTML = marked.parse(text);
    } else {
        contentContainer.innerText = text;
    }
    msgDiv.appendChild(contentContainer);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
};

// ==========================================
// ТЕМЫ (УСТАРЕВШЕЕ, НО ОСТАВЛЯЕМ ДЛЯ СОВМЕСТИМОСТИ)
// ==========================================

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

// ==========================================
// СООБЩЕНИЯ
// ==========================================

window.renderMessageToDOM = function(text, className, msgId = null, isFav = false) {
    const container = document.getElementById('chat-container'); 
    if (!container) return;
    const msgDiv = document.createElement('div'); 
    msgDiv.className = `msg ${className} msg-animated`;
    const finalMsgId = msgId || window.generateUUID();
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

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ИНТЕРФЕЙСЫ
// ==========================================

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

window.showBetaAlert = function() {
    if (window.tg?.showAlert) {
        window.tg.showAlert(window.getLangString('beta_alert'));
    } else {
        alert(window.getLangString('beta_alert'));
    }
};

window.handleAttachmentClick = function() {
    if (typeof window.triggerMediaSelector === 'function') {
        window.triggerMediaSelector();
    }
};

window.showSyncStatus = function(status, isError = false) {
    const indicator = document.getElementById('chat-model-indicator');
    if (!indicator) return;
    const originalText = indicator.innerText;
    if (status === 'syncing') {
        indicator.innerHTML = '<span style="opacity:0.7;">🔄 синхр...</span>';
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

console.log('✅ ui.js полностью загружен');
