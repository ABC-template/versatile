// js/modules/sync/device-manager.js

// Генерация уникального fingerprint устройства
window.generateDeviceFingerprint = function() {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    // Компоненты для fingerprint
    const components = [
        user?.id || 'unknown',
        navigator.userAgent || 'unknown',
        tg?.platform || 'unknown',
        screen.width + 'x' + screen.height,
        navigator.language || 'unknown'
    ];
    
    // Создаем простой хеш
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    // Сохраняем в localStorage
    const fingerprint = `device_${Math.abs(hash)}_${Date.now()}`;
    
    // Проверяем, есть ли сохраненный fingerprint
    const saved = localStorage.getItem('device_fingerprint');
    if (saved) {
        return saved;
    }
    
    // Сохраняем новый
    localStorage.setItem('device_fingerprint', fingerprint);
    return fingerprint;
};

// Регистрация устройства на сервере
window.registerDevice = async function() {
    if (!window.config || !window.config.syncEnabled) {
        console.log("Синхронизация отключена, регистрация устройства не требуется");
        return;
    }
    
    const fingerprint = window.generateDeviceFingerprint();
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    // Определяем название устройства
    let deviceName = 'Unknown';
    let platform = 'unknown';
    
    if (tg?.platform) {
        platform = tg.platform;
        if (platform === 'ios') deviceName = 'iPhone';
        else if (platform === 'android') deviceName = 'Android';
        else if (platform === 'macos') deviceName = 'Mac';
        else if (platform === 'win') deviceName = 'Windows';
        else deviceName = platform;
    } else {
        const ua = navigator.userAgent;
        if (ua.includes('iPhone')) deviceName = 'iPhone';
        else if (ua.includes('Android')) deviceName = 'Android';
        else if (ua.includes('Mac')) deviceName = 'Mac';
        else if (ua.includes('Windows')) deviceName = 'Windows';
        else deviceName = 'Web Browser';
    }
    
    const initData = tg?.initData;
    if (!initData) {
        console.warn("Нет initData для регистрации устройства");
        return;
    }
    
    try {
        const response = await fetch('/api/user/register-device', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({
                deviceFingerprint: fingerprint,
                deviceName: deviceName,
                platform: platform
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.isNew) {
                console.log(`🆕 Новое устройство зарегистрировано: ${deviceName} (${platform})`);
            } else {
                console.log(`🔄 Устройство обновлено: ${deviceName}`);
            }
            window.deviceFingerprint = fingerprint;
            return true;
        } else {
            console.error("Ошибка регистрации устройства:", data.error);
            return false;
        }
    } catch (err) {
        console.error("Сбой регистрации устройства:", err);
        return false;
    }
};

// Обновление активности устройства
window.updateDeviceActivity = function() {
    if (!window.config?.syncEnabled) return;
    if (!window.deviceFingerprint) return;
    
    // Отправляем обновление не чаще раза в минуту
    const now = Date.now();
    const lastUpdate = window._lastActivityUpdate || 0;
    if (now - lastUpdate < 60000) return;
    window._lastActivityUpdate = now;
    
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    
    fetch('/api/user/register-device', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': initData
        },
        body: JSON.stringify({
            deviceFingerprint: window.deviceFingerprint,
            deviceName: window.deviceName || 'Unknown',
            platform: window.platform || 'unknown'
        })
    }).catch(err => console.error("Ошибка обновления активности:", err));
};

// Получение fingerprint текущего устройства
window.getDeviceFingerprint = function() {
    return window.deviceFingerprint || localStorage.getItem('device_fingerprint');
};

// Инициализация менеджера устройств
window.initDeviceManager = async function() {
    if (!window.config?.syncEnabled) {
        console.log("📱 Синхронизация отключена, устройство не регистрируется");
        return;
    }
    
    console.log("🔧 Инициализация менеджера устройств...");
    
    // Генерируем или получаем fingerprint
    const fingerprint = window.generateDeviceFingerprint();
    console.log("🖨️ Device fingerprint:", fingerprint);
    
    // Регистрируем устройство
    const registered = await window.registerDevice();
    
    if (registered) {
        console.log("✅ Устройство зарегистрировано для синхронизации");
        // Запускаем периодическое обновление активности
        setInterval(() => window.updateDeviceActivity(), 5 * 60 * 1000); // каждые 5 минут
    }
};
