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
    
    // ... все остальные методы (renderMessage, renderAIMessage и т.д.) ...
    
    // ==========================================
    // ОБРАБОТКА КЛИКА ПО ТЕГАМ
    // ==========================================
    
    handleTagClick(topic) {
        console.log('🏷️ Выбран топик:', topic);
        
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (window.tg?.BackButton) window.tg.BackButton.hide();
        
        if (window.chatUI) {
            window.chatUI.switchTopic(topic);
        }
        
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.topic === topic);
        });
    }
}

// Экспортируем как глобальный объект
window.UIRenderer = UIRenderer;
window.uiRenderer = new UIRenderer();

// 👇 ГЛОБАЛЬНАЯ ОБЕРТКА ДЛЯ ИСПОЛЬЗОВАНИЯ В HTML
window.handleTagClick = window.uiRenderer.handleTagClick.bind(window.uiRenderer);

console.log('✅ UIRenderer загружен');
