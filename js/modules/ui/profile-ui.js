// ============================================
// js/modules/ui/profile-ui.js
// Описание: Профиль, настройки, история чатов (убрана sync)
// Версия: 2.0.0
// ============================================

class ProfileUI {
    constructor() {
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.uiRenderer = window.uiRenderer;
        this.chatUI = window.chatUI;
        this.currentFilter = 'all';
    }
    
    // ==========================================
    // ОТКРЫТИЕ ВКЛАДОК
    // ==========================================
    
    openModalTab(tabName) {
        const card = document.getElementById('profile-card');
        const keyArea = document.getElementById('dynamic-key-area');
        
        if (tabName === 'organizer') {
            if (keyArea) keyArea.style.display = 'none';
            if (window.organizerUI) {
                window.organizerUI.renderTodoModule();
                window.organizerUI.renderSchedulerModule();
                window.organizerUI.renderTrackerModule();
            }
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
                if (window.syncContextSliderWithActiveChat) {
                    window.syncContextSliderWithActiveChat();
                }
            } else {
                keyArea.style.display = 'none';
            }
        }
        
        if (tabName === 'favorites') this.renderGlobalFavorites();
        if (tabName === 'chats') this.renderHistoryChatsList();
        
        if (window.tg?.BackButton) {
            window.tg.BackButton.show();
            window.tg.BackButton.offClick();
            window.tg.BackButton.onClick(() => {
                card.classList.add('hidden');
                window.tg.BackButton.hide();
            });
        }
    }
    
    // ==========================================
    // ИСТОРИЯ ЧАТОВ
    // ==========================================
    
    renderHistoryChatsList(filterTopic) {
        const listContainer = document.getElementById('history-chats-list');
        if (!listContainer) return;
        
        const activeFilter = filterTopic || this.currentFilter || 'all';
        listContainer.innerHTML = '';
        
        let allChats = [];
        
        for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
            if (!chats) continue;
            for (const chat of chats) {
                if (chat.deleted_at) continue;
                if (!chat.synced && !this.chatStore.hasRealMessages(chat)) continue;
                allChats.push({
                    ...chat,
                    topic: topic,
                    topicDisplay: window.topicShortNames?.[topic] || topic
                });
            }
        }
        
        if (activeFilter !== 'all') {
            allChats = allChats.filter(chat => chat.topic === activeFilter);
        }
        
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
            const timeStr = this.formatDate(lastTime);
            
            const chatItem = document.createElement('div');
            chatItem.className = `chat-history-item ${chat.id === this.chatStore.activeIds[chat.topic] ? 'active' : ''}`;
            chatItem.setAttribute('onclick', `window.profileUI.switchToChat('${chat.id}', '${chat.topic}')`);
            
            chatItem.innerHTML = `
                <div style="flex:1; overflow:hidden; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:10px; font-weight:600; color:var(--button-color); flex-shrink:0; background:rgba(var(--tg-theme-button-color,0,136,204),0.08); padding:2px 8px; border-radius:4px;">${chat.topicDisplay}</span>
                        <span class="chat-title-text" style="font-weight:500; font-size:13px;">${chat.title || 'Без названия'}</span>
                    </div>
                    <div style="font-size:11px; color:var(--hint-color); margin-top:2px;">${count} ${this.pluralize(count, 'сообщение', 'сообщения', 'сообщений')} • ${timeStr}</div>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0; margin-left:8px;">
                    <button class="delete-chat-btn" style="opacity:0.6; font-size:13px;" onclick="event.stopPropagation(); window.renameChat(event, '${chat.id}')">✏️</button>
                    <button class="delete-chat-btn" style="font-size:13px;" onclick="event.stopPropagation(); window.deleteChat(event, '${chat.id}')">🗑️</button>
                </div>
            `;
            
            listContainer.appendChild(chatItem);
        }
    }
    
    applyChatFilter(topic) {
        this.currentFilter = topic;
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
        this.renderHistoryChatsList(topic === 'all' ? null : topic);
    }
    
    async switchToChat(chatId, topic) {
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        if (this.chatStore.currentTopic !== topic) {
            this.chatStore.currentTopic = topic;
            document.querySelectorAll('.tag-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.topic === topic);
            });
        }
        
        this.chatStore.setActiveChat(topic, chatId);
        
        // Проверяем версию при открытии
        if (this.userStore.canSync() && window.chatService) {
            await window.chatService.openChat(chatId);
        }
        
        this.chatUI.refreshUI();
        this.chatUI.showChatInterface();
    }
    
    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================
    
    renderGlobalFavorites() {
        const container = document.getElementById('global-favorites-list');
        if (!container) return;
        
        container.innerHTML = '';
        const favorites = this.chatStore.getFavorites();
        
        if (favorites.length === 0) {
            container.innerHTML = `<p style="font-size:12px; color:var(--hint-color); text-align:center; margin-top:20px;">${window.getLangString ? window.getLangString('no_fav') : 'У вас пока нет избранных ответов.'}</p>`;
            return;
        }
        
        for (const msg of favorites) {
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
                    <span>🤖 ${window.topicNames?.[msg.topic] || msg.topic}</span>
                    <span>📂 ${msg.chat_title}</span>
                </div>
                <div style="color:var(--text-color); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shortText}</div>
            `;
            
            contentDiv.onclick = () => {
                this.chatStore.currentTopic = msg.topic;
                this.chatStore.setActiveChat(msg.topic, msg.chat_id);
                document.getElementById('profile-card').classList.add('hidden');
                if (window.tg?.BackButton) window.tg.BackButton.hide();
                
                setTimeout(() => {
                    this.chatUI.refreshUI();
                    this.chatUI.showChatInterface();
                    const target = document.getElementById(`msg-block-${msg.id}`);
                    const chatCont = document.getElementById('chat-container');
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
            unfavBtn.textContent = '❤️';
            unfavBtn.title = window.getLangString ? window.getLangString('confirm_unfav') : 'Убрать из избранного';
            unfavBtn.onclick = (e) => {
                e.stopPropagation();
                const actionUnfav = () => {
                    if (window.messageService) {
                        window.messageService.toggleFavorite(msg.chat_id, msg.id);
                    }
                    favItem.style.transition = 'all 0.25s ease';
                    favItem.style.opacity = '0';
                    favItem.style.transform = 'scale(0.95)';
                    setTimeout(() => this.renderGlobalFavorites(), 250);
                };
                
                const confirmMsg = window.getLangString ? window.getLangString('confirm_unfav') : 'Убрать из избранного?';
                if (window.tg?.showConfirm) {
                    window.tg.showConfirm(confirmMsg, (ok) => { if (ok) actionUnfav(); });
                } else if (confirm(confirmMsg)) {
                    actionUnfav();
                }
            };
            
            favItem.appendChild(contentDiv);
            favItem.appendChild(unfavBtn);
            container.appendChild(favItem);
        }
    }
    
    // ==========================================
    // КОНТЕКСТ (ПАМЯТЬ ЧАТА)
    // ==========================================
    
    syncContextSliderWithActiveChat() {
        const slider = document.getElementById('context-slider');
        const valueLabel = document.getElementById('context-range-value');
        const helpBlock = document.getElementById('context-help-text');
        
        if (!slider || !valueLabel) return;
        if (helpBlock) helpBlock.classList.add('hidden');
        
        const activeChat = this.chatStore.getActiveChat();
        const currentContextSize = activeChat ? (activeChat.maxContext || 15) : 15;
        
        slider.value = currentContextSize;
        valueLabel.textContent = currentContextSize;
        
        const userRole = this.userStore.role || 'trial';
        const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);
        
        if (!hasAccess) {
            slider.disabled = true;
            slider.style.opacity = '0.5';
            slider.style.pointerEvents = 'auto';
            slider.onclick = (e) => {
                e.preventDefault();
                if (window.showBetaAlert) window.showBetaAlert();
            };
        } else {
            slider.disabled = false;
            slider.style.opacity = '1';
            slider.onclick = null;
        }
    }
    
    toggleContextHelp(event) {
        if (event) event.stopPropagation();
        const helpBlock = document.getElementById('context-help-text');
        if (helpBlock) helpBlock.classList.toggle('hidden');
    }
    
    onContextSliderChange(val) {
        const valueLabel = document.getElementById('context-range-value');
        if (valueLabel) valueLabel.textContent = val;
    }
    
    async saveContextSettings() {
        const slider = document.getElementById('context-slider');
        if (!slider) return;
        
        const userRole = this.userStore.role || 'trial';
        const hasAccess = ['premium', 'admin', 'standard', 'creator'].includes(userRole);
        
        if (!hasAccess) {
            if (window.showBetaAlert) window.showBetaAlert();
            this.syncContextSliderWithActiveChat();
            return;
        }
        
        const activeChat = this.chatStore.getActiveChat();
        if (activeChat) {
            const newContext = parseInt(slider.value, 10);
            activeChat.maxContext = newContext;
            this.chatStore.saveToStorage();
            
            if (this.userStore.canSync() && activeChat.id) {
                if (window.chatService) {
                    await window.chatService.updateContext(activeChat.id, newContext);
                }
            }
        }
    }
    
    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==========================================
    
    formatDate(dateStr) {
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
    }
    
    pluralize(count, one, two, five) {
        const n = Math.abs(count) % 100;
        const n1 = n % 10;
        if (n > 10 && n < 20) return five;
        if (n1 > 1 && n1 < 5) return two;
        if (n1 === 1) return one;
        return five;
    }
}

// Экспорт
window.ProfileUI = ProfileUI;
window.profileUI = new ProfileUI();

console.log('✅ ProfileUI v2.0 загружен');
