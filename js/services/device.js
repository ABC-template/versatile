// ============================================
// js/services/device.js
// Описание: Управление устройствами и fingerprint
// Версия: 1.0.0
// ============================================

class DeviceService {
    constructor() {
        this.userStore = window.userStore;
        this.apiClient = window.apiClient;
    }

    // ==========================================
    // ГЕНЕРАЦИЯ УНИКАЛЬНОГО FINGERPRINT
    // ==========================================

    generateFingerprint() {
        const tg = window.Telegram?.WebApp;
        const user = tg?.initDataUnsafe?.user;
        
        const components = [
            user?.id || 'unknown',
            navigator.userAgent || 'unknown',
            tg?.platform || 'unknown',
            navigator.language || 'unknown',
            navigator.hardwareConcurrency || 'unknown',
            screen.width + 'x' + screen.height,
            screen.colorDepth || 'unknown',
            navigator.deviceMemory || 'unknown',
            tg?.version || 'unknown',
            tg?.isExpanded || false,
            new Date().getTimezoneOffset()
        ];
        
        const str = components.join('|');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        
        // Определяем тип устройства
        const isTelegramWebApp = !!tg?.initData;
        const platform = tg?.platform || 'web';
        const deviceType = isTelegramWebApp ? `tg_${platform}` : 'web';
        
        const fingerprint = `device_${user?.id}_${Math.abs(hash)}_${deviceType}`;
        
        return {
            fingerprint: fingerprint,
            deviceType: deviceType,
            platform: platform,
            isTelegramWebApp: isTelegramWebApp
        };
    }

    // ==========================================
    // ПОЛУЧЕНИЕ СОХРАНЕННОГО FINGERPRINT
    // ==========================================

    getStoredFingerprint() {
        // Сначала проверяем UserStore
        if (this.userStore && this.userStore.getDeviceFingerprint()) {
            return this.userStore.getDeviceFingerprint();
        }
        
        // Затем localStorage
        const saved = localStorage.getItem('device_fingerprint');
        if (saved) return saved;
        
        // Генерируем новый
        const { fingerprint } = this.generateFingerprint();
        localStorage.setItem('device_fingerprint', fingerprint);
        return fingerprint;
    }

    // ==========================================
    // РЕГИСТРАЦИЯ УСТРОЙСТВА
    // ==========================================

    async register() {
        if (!this.userStore || !this.userStore.canSync()) {
            console.log('⏭️ Синхронизация отключена, устройство не регистрируется');
            return false;
        }

        const { fingerprint, deviceType, platform } = this.generateFingerprint();
        const initData = window.Telegram?.WebApp?.initData;

        if (!initData) {
            console.error('❌ Нет initData для регистрации устройства');
            return false;
        }

        try {
            console.log('📤 Отправляем запрос на регистрацию устройства...');
            
            const data = await this.apiClient.post('/users/register-device', {
                deviceFingerprint: fingerprint,
                deviceType: deviceType,
                platform: platform
            });

            if (data.success) {
                if (data.signedFingerprint) {
                    localStorage.setItem('device_fingerprint_signed', data.signedFingerprint);
                    if (this.userStore) {
                        this.userStore.setDeviceFingerprint(fingerprint, data.signedFingerprint);
                    }
                }
                console.log(data.isNew ? '🆕 Новое устройство зарегистрировано' : '🔄 Устройство уже зарегистрировано');
                return true;
            }
            console.error('❌ Ошибка регистрации устройства:', data.error);
            return false;
        } catch (err) {
            console.error('❌ Ошибка регистрации устройства:', err);
            return false;
        }
    }

    // ==========================================
    // ПОЛУЧЕНИЕ ПОДПИСАННОГО FINGERPRINT
    // ==========================================

    getSignedFingerprint() {
        if (this.userStore) {
            return this.userStore.getDeviceFingerprint();
        }
        const signed = localStorage.getItem('device_fingerprint_signed');
        if (signed) return signed;
        return this.getStoredFingerprint();
    }
}

// Экспорт
window.DeviceService = DeviceService;
window.deviceService = new DeviceService();

console.log('✅ DeviceService v1.0 загружен');
