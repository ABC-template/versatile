// js/modules/net-stream.js - минимальная версия для проверки
console.log('✅ net-stream.js загружен (тестовая версия)');

window.streamAiResponse = async function(cleanHistoryMessages, userKey, userLang, attachedImage, activeChat) {
    console.log('🎯 ТЕСТОВАЯ streamAiResponse вызвана!');
    console.log('📸 Есть фото?', !!attachedImage);
    
    if (typeof window.hideSkeleton === 'function') window.hideSkeleton();
    
    if (typeof window.renderMessageToDOM === 'function') {
        if (attachedImage) {
            window.renderMessageToDOM('✅ Тестовая заглушка: изображение получено, но AI временно отключен для отладки.', 'ai-msg');
        } else {
            window.renderMessageToDOM('✅ Тестовая заглушка: сообщение получено, но AI временно отключен для отладки.', 'ai-msg');
        }
    }
    
    return true;
};
