// ============================================
// js/modules/chat/media.js
// Описание: Работа с изображениями
// ============================================

console.log('✅ ChatMedia загружен');

// Глобальное состояние прикрепленного изображения
window.currentAttachedImageBase64 = null;

/**
 * Инициализация скрытого инпута выбора файла
 */
window.initMediaAttachment = function() {
    if (document.getElementById('hidden-file-input')) return;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'hidden-file-input';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        window.processAndResizeImage(file);
    });
    
    document.body.appendChild(fileInput);
};

/**
 * Открыть выбор файла (только для создателя)
 */
window.triggerMediaSelector = function() {
    const userRole = window.userStore?.role || 'trial';
    const hasAccess = userRole === 'creator' || userRole === 'admin';
    
    if (!hasAccess) {
        if (window.showBetaAlert) window.showBetaAlert();
        return;
    }
    
    window.initMediaAttachment();
    const fileInput = document.getElementById('hidden-file-input');
    if (fileInput) {
        fileInput.value = '';
        fileInput.click();
    }
};

/**
 * Обработка и ресайз изображения
 */
window.processAndResizeImage = function(file) {
    const MAX_FILE_SIZE_MB = 10;
    const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    if (file.size > maxSizeBytes) {
        if (window.tg?.showAlert) {
            window.tg.showAlert(`Файл слишком большой! Максимум ${MAX_FILE_SIZE_MB}MB.`);
        } else {
            alert(`Файл слишком большой! Максимум ${MAX_FILE_SIZE_MB}MB.`);
        }
        const fileInput = document.getElementById('hidden-file-input');
        if (fileInput) fileInput.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const maxDimension = 1024;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            window.currentAttachedImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
            window.renderImagePreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

/**
 * Рендеринг превью изображения
 */
window.renderImagePreview = function() {
    window.clearImagePreviewDOM();
    
    const inputArea = document.getElementById('input-area');
    if (!inputArea || !window.currentAttachedImageBase64) return;
    
    const previewContainer = document.createElement('div');
    previewContainer.id = 'media-preview-container';
    previewContainer.style.cssText = 'display:flex; align-items:center; background:rgba(0,0,0,0.03); padding:6px 10px; border-radius:12px; margin-bottom:4px; gap:8px; width:fit-content; border:1px solid rgba(0,0,0,0.04); animation:fadeInUp 0.2s ease;';
    
    const imgElement = document.createElement('img');
    imgElement.src = window.currentAttachedImageBase64;
    imgElement.style.cssText = 'width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid rgba(0,0,0,0.08);';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.style.cssText = 'background:transparent; border:none; outline:none; font-size:12px; cursor:pointer; color:var(--hint-color); padding:4px; font-weight:bold;';
    deleteBtn.onclick = function(e) {
        e.stopPropagation();
        window.clearImageAttachment();
    };
    
    previewContainer.appendChild(imgElement);
    previewContainer.appendChild(deleteBtn);
    
    // Вставляем превью первым элементом в капсулу ввода
    inputArea.insertBefore(previewContainer, inputArea.firstChild);
};

/**
 * Очистка DOM превью
 */
window.clearImagePreviewDOM = function() {
    const existingContainer = document.getElementById('media-preview-container');
    if (existingContainer) existingContainer.remove();
};

/**
 * Полный сброс прикрепленного изображения
 */
window.clearImageAttachment = function() {
    window.currentAttachedImageBase64 = null;
    window.clearImagePreviewDOM();
    const fileInput = document.getElementById('hidden-file-input');
    if (fileInput) fileInput.value = '';
};

console.log('✅ ChatMedia загружен');
