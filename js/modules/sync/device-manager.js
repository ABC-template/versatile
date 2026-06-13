// js/modules/sync/device-manager.js

// Генерация уникального fingerprint устройства
window.generateDeviceFingerprint = function() {
    const saved = localStorage.getItem('device_fingerprint');
    if (saved) return saved;
    
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    // Включаем user_id в fingerprint для уникальности пары (устройство + аккаунт)
    const components = [
        user?.id || 'unknown',
        navigator.userAgent || 'unknown',
        tg?.platform || 'unknown',
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset()
    ];
    
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    
    const fingerprint = `device_${user?.id}_${Math.abs(hash)}`;
    localStorage.setItem('device_fingerprint', fingerprint);
    console.log(`🔑 Сгенерирован fingerprint устройства: ${fingerprint}`);
    return fingerprint;
};

// Регистрация устройства
window.registerDevice = async function() {
    if (!window.config?.syncEnabled) {
        console.log("Синхронизация отключена, устройство не регистрируется");
        return false;
    }
    
    const fingerprint = window.generateDeviceFingerprint();
    const initData = window.Telegram?.WebApp?.initData;
    
    if (!initData) {
        console.error("Нет initData для регистрации устройства");
        return false;
    }
    
    try {
        console.log("📤 Отправляем запрос на регистрацию устройства...");
        const response = await fetch('/api/user/register-device', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({
                deviceFingerprint: fingerprint
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.signedFingerprint) {
                localStorage.setItem('device_fingerprint_signed', data.signedFingerprint);
                window.deviceFingerprintSigned = data.signedFingerprint;
            }
            window.deviceFingerprint = fingerprint;
            console.log(data.isNew ? "🆕 Новое устройство зарегистрировано" : "🔄 Устройство уже зарегистрировано");
            return true;
        }
        console.error("Ошибка регистрации устройства:", data.error);
        return false;
    } catch (err) {
        console.error("Ошибка регистрации устройства:", err);
        return false;
    }
};

// Получение подписанного fingerprint для сервера
window.getDeviceFingerprint = function() {
    const signed = localStorage.getItem('device_fingerprint_signed') || window.deviceFingerprintSigned;
    if (signed) return signed;
    return window.deviceFingerprint || localStorage.getItem('device_fingerprint');
};

// Инициализация менеджера устройств
window.initDeviceManager = async function() {
    if (!window.config?.syncEnabled) return;
    console.log("🔧 Инициализация менеджера устройств...");
    await window.registerDevice();
};
