// ============================================
// js/modules/ui/renderer.js
// Описание: Базовый рендеринг UI-элементов
// ============================================

class UIRenderer {
    constructor() {
        this.chatStore = window.chatStore;
        this.userStore = window.userStore;
        this.syncStore = window.syncStore;
    }
    
    // ==========================================
    // СООБЩЕНИЯ
    // ==========================================
    
    /**
     * Рендеринг сообщения в DOM
     */
    renderMessage(text, type, msgId = null, isFavorite = false) {
        const container = document.getElementById('chat-container');
        if (!container) return null;
        
        const finalMsgId = msgId || this.chatStore.generateUUID();
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${type} msg-animated`;
        msgDiv.id = `msg-block-${finalMsgId}`;
        
        if (type === 'ai-msg') {
            this.renderAIMessage(msgDiv, text, finalMsgId, isFavorite);
        } else {
            this.renderUserMessage(msgDiv, text, finalMsgId);
        }
        
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
        
        return msgDiv;
    }
    
    /**
     * Рендеринг AI-сообщения с Markdown
     */
    renderAIMessage(container, text, msgId, isFavorite) {
        const contentDiv = document.createElement('div');
        contentDiv.style.width = '100%';
        
        try {
            if (typeof marked !== 'undefined') {
                let html = marked.parse(text);
                html = html.replace(
                    /<table[^>]*>([\s\S]*?)<\/table>/gi,
                    '<div class="table-wrapper"><table>$1</table></div>'
                );
                contentDiv.innerHTML = this.sanitizeHTML(html);
                
                // Добавляем кнопки копирования для кода
                contentDiv.querySelectorAll('pre').forEach((pre) => {
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
                contentDiv.textContent = text;
            }
        } catch (e) {
            contentDiv.textContent = text;
        }
        
        container.appendChild(contentDiv);
        
        // Добавляем действия
        const isWelcome = text.includes('Привет') || text.includes('Welcome');
        if (!isWelcome) {
            const actions = this.createMessageActions(msgId, isFavorite);
            container.appendChild(actions);
        }
    }
    
    /**
     * Рендеринг пользовательского сообщения
     */
    renderUserMessage(container, text, msgId) {
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        container.appendChild(textSpan);
        
        // Кнопка удаления для пользовательских сообщений
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.style.cssText = 'background:transparent; border:none; outline:none; font-size:11px; cursor:pointer; margin-left:8px; opacity:0.4; padding:0; vertical-align:middle;';
        delBtn.onclick = () => {
            if (window.messageService) {
                window.messageService.deleteMessage(
                    this.chatStore.getActiveChat()?.id,
                    msgId
                );
            }
        };
        container.appendChild(delBtn);
    }
    
    /**
     * Создание действий для сообщения
     */
    createMessageActions(msgId, isFavorite) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        actions.innerHTML = `
            <button class="action-btn" data-tooltip="📋" onclick="window.copyMsgText(this, '${msgId}')">📋</button>
            <button class="action-btn" data-tooltip="🔗" onclick="window.shareMsgText(this, '${msgId}')">🔗</button>
            <button class="action-btn ${isFavorite ? 'is-favorite' : ''}" onclick="window.toggleFavoriteMsg(this, '${msgId}')">
                <span class="icon-heart">${isFavorite ? '❤️' : '🤍'}</span>
            </button>
            <button class="action-btn" style="margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;" onclick="window.deleteMessage('${msgId}')">🗑️</button>
        `;
        return actions;
    }
    
    /**
     * Санитайзинг HTML
     */
    sanitizeHTML(html) {
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    'p', 'br', 'strong', 'em', 'u', 'i', 'b',
                    'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'ul', 'ol', 'li', 'blockquote',
                    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                    'span', 'div', 'img', 'hr', 'sub', 'sup'
                ],
                ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'],
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
            });
        }
        
        // Fallback
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    }
    
    // ==========================================
    // SKELETON
    // ==========================================
    
    showSkeleton() {
        const container = document.getElementById('chat-container');
        if (!container || document.getElementById('ai-skeleton-loader')) return;
        
        const skDiv = document.createElement('div');
        skDiv.id = 'ai-skeleton-loader';
        skDiv.className = 'skeleton-loading';
        skDiv.innerHTML = `
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
        `;
        container.appendChild(skDiv);
        container.scrollTop = container.scrollHeight;
    }
    
    hideSkeleton() {
        const sk = document.getElementById('ai-skeleton-loader');
        if (sk) sk.remove();
    }
    
    // ==========================================
    // WELCOME MESSAGE
    // ==========================================
    
    renderWelcome(text) {
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
            contentContainer.textContent = text;
        }
        
        msgDiv.appendChild(contentContainer);
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }
    
    // ==========================================
    // ОБЛАКО ТЕГОВ (ТОЛЬКО ОДИН РАЗ!)
    // ==========================================
    
    renderTagsCloud() {
        const container = document.getElementById('tags-cloud-container');
        if (!container) return;
        
        const topics = [
            { id: 'code', icon: '💻', name: '#кодинг' },
            { id: 'creative', icon: '✍️', name: '#креатив' },
            { id: 'fast', icon: '⚡', name: '#флуд' },
            { id: 'kitchen', icon: '🍳', name: '#кухня' },
            { id: 'analytics', icon: '📊', name: '#аналитика' }
        ];
        
        container.innerHTML = `
            <div class="tags-cloud-wrapper">
                <div class="tags-cloud-header">
                    <h2>🌤️ Добро пожаловать!</h2>
                    <p style="color: var(--hint-color); font-size: 14px; margin: 4px 0 16px 0;">Выбери направление для общения:</p>
                </div>
                <div class="tags-cloud-grid">
                    ${topics.map(t => `
                        <div class="tag-chip" data-topic="${t.id}" onclick="window.handleTagClick('${t.id}')">
                            <span class="tag-icon">${t.icon}</span>
                            <span class="tag-name">${t.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // ==========================================
    // СТАТУСЫ
    // ==========================================
    
    showSyncStatus(status, isError = false) {
        const indicator = document.getElementById('chat-model-indicator');
        if (!indicator) return;
        
        const originalText = indicator.innerText;
        
        switch (status) {
            case 'syncing':
                indicator.innerHTML = '<span style="opacity:0.7;">🔄 синхр...</span>';
                setTimeout(() => {
                    if (indicator.innerHTML === '<span style="opacity:0.7;">🔄 синхр...</span>') {
                        indicator.innerText = originalText;
                    }
                }, 2000);
                break;
            case 'success':
                indicator.innerHTML = '<span style="color: #27ae60;">✓ синхр.</span>';
                setTimeout(() => {
                    if (indicator.innerHTML === '<span style="color: #27ae60;">✓ синхр.</span>') {
                        indicator.innerText = originalText;
                    }
                }, 1500);
                break;
            case 'error':
                indicator.innerHTML = '<span style="color: #e74c3c;">⚠️ офлайн</span>';
                break;
            default:
                indicator.innerText = originalText;
        }
    }
}

// Экспортируем как глобальный объект
window.UIRenderer = UIRenderer;
window.uiRenderer = new UIRenderer();

console.log('✅ UIRenderer загружен');
