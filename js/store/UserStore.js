// ============================================
// js/store/UserStore.js
// Описание: Пользователь, настройки, лимиты
// ============================================

class UserStore {
    constructor() {
        this.userId = null;
        this.username = null;
        this.firstName = null;
        this.lastName = null;
        this.languageCode = 'ru';
        this.photoUrl = null;
        
        this.role = 'trial';
        this.dailyLimit = 5;
        this.usedToday = 0;
        this.syncEnabled = false;
        
        this.deviceFingerprint = null;
        this.signedFingerprint = null;
        
        this.isCreator = false;
        this.CREATOR_ID = 1541531808;
        
        this.loadFromStorage();
        this.initFromTelegram();
    }
    
    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    
    initFromTelegram() {
        const tg = window.Telegram?.WebApp;
        const user = tg?.initDataUnsafe?.user;
        
        if (user) {
            this.userId = user.id;
            this.username = user.username || null;
            this.firstName = user.first_name || '';
            this.lastName = user.last_name || '';
            this.languageCode = user.language_code || 'ru';
            this.photoUrl = user.photo_url || null;
            
            this.isCreator = this.userId === this.CREATOR_ID;
            
            console.log(`👤 Пользователь: ${this.firstName} (${this.userId})`);
        }
    }
    
    loadFromStorage() {
        try {
            const data = localStorage.getItem('user_store_data');
            if (data) {
                const parsed = JSON.parse(data);
                Object.assign(this, parsed);
            }
        } catch (e) {
            // Игнорируем
        }
    }
    
    saveToStorage() {
        try {
            const data = {
                userId: this.userId,
                role: this.role,
                dailyLimit: this.dailyLimit,
                usedToday: this.usedToday,
                syncEnabled: this.syncEnabled,
                deviceFingerprint: this.deviceFingerprint,
                signedFingerprint: this.signedFingerprint
            };
            localStorage.setItem('user_store_data', JSON.stringify(data));
        } catch (e) {
            console.error('Ошибка сохранения UserStore:', e);
        }
    }
    
    // ==========================================
    // НАСТРОЙКИ
    // ==========================================
    
    setRole(role, dailyLimit, syncEnabled) {
        this.role = role;
        this.dailyLimit = dailyLimit;
        this.syncEnabled = syncEnabled;
        this.saveToStorage();
    }
    
    incrementUsage() {
        this.usedToday++;
        this.saveToStorage();
        
        // Сохраняем в CloudStorage если доступно
        const today = new Date().toLocaleDateString();
        const data = JSON.stringify({ date: today, count: this.usedToday });
        
        if (window.Telegram?.WebApp?.CloudStorage) {
            window.Telegram.WebApp.CloudStorage.setItem('usage_data', data);
        }
        
        return this.usedToday;
    }
    
    resetDailyUsage() {
        this.usedToday = 0;
        this.saveToStorage();
    }
    
    setDeviceFingerprint(fingerprint, signed) {
        this.deviceFingerprint = fingerprint;
        this.signedFingerprint = signed;
        this.saveToStorage();
    }
    
    getDeviceFingerprint() {
        return this.signedFingerprint || this.deviceFingerprint || null;
    }
    
    // ==========================================
    // ПРОВЕРКИ
    // ==========================================
    
    isPro() {
        return ['premium', 'admin', 'creator'].includes(this.role);
    }
    
    isAdmin() {
        return ['admin', 'creator'].includes(this.role);
    }
    
    hasUnlimited() {
        return this.dailyLimit >= 9999;
    }
    
    canSync() {
        return this.syncEnabled === true;
    }
    
    hasRemainingQuota() {
        if (this.hasUnlimited()) return true;
        return this.usedToday < this.dailyLimit;
    }
    
    getRemainingQuota() {
        if (this.hasUnlimited()) return Infinity;
        return Math.max(0, this.dailyLimit - this.usedToday);
    }
    
    // ==========================================
    // АВАТАР
    // ==========================================
    
    getAvatarUrl() {
        return this.photoUrl || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
    }
    
    getDisplayName() {
        let name = this.firstName || '';
        if (this.lastName) {
            name += ' ' + this.lastName;
        }
        return name || 'Пользователь';
    }
}

// Экспортируем как глобальный объект
window.UserStore = UserStore;
window.userStore = new UserStore();

console.log('✅ UserStore загружен');
