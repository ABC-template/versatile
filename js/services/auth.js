// ============================================
// js/services/auth.js
// Описание: Сервис авторизации (упрощенный)
// Версия: 2.0.0
// ============================================

class AuthService {
    constructor() {
        this.apiClient = window.apiClient;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // ПРОВЕРКА ПОДПИСКИ
    // ==========================================
    
    async checkSubscription() {
        try {
            const data = await this.apiClient.get('/auth/check');
            
            if (data.error) {
                console.error('Ошибка проверки подписки:', data.error);
                return this.fallbackToOffline();
            }
            
            // Обновляем данные пользователя
            this.userStore.setRole(
                data.role || 'trial',
                data.dailyLimit || 5,
                data.syncEnabled === true
            );
            
            if (data.userId) {
                this.userStore.userId = data.userId;
            }
            
            this.userStore.saveToStorage();
            
            return {
                isMember: data.isMember !== false,
                role: data.role || 'trial',
                dailyLimit: data.dailyLimit || 5,
                syncEnabled: data.syncEnabled === true,
                serverModels: data.serverModels || {}
            };
            
        } catch (err) {
            console.error('Auth check error:', err);
            return this.fallbackToOffline();
        }
    }
    
    // ==========================================
    // FALLBACK (ОФЛАЙН РЕЖИМ)
    // ==========================================
    
    fallbackToOffline() {
        // Если пользователь создатель, даем полный доступ
        if (this.userStore.isCreator) {
            this.userStore.setRole('creator', 9999, true);
            return {
                isMember: true,
                role: 'creator',
                dailyLimit: 9999,
                syncEnabled: true,
                serverModels: {}
            };
        }
        
        // Иначе проверяем localStorage
        const savedRole = localStorage.getItem('user_role');
        if (savedRole === 'admin' || savedRole === 'creator') {
            this.userStore.setRole(savedRole, 9999, true);
            return {
                isMember: true,
                role: savedRole,
                dailyLimit: 9999,
                syncEnabled: true,
                serverModels: {}
            };
        }
        
        // Гостевой режим
        this.userStore.setRole('guest', 0, false);
        return {
            isMember: false,
            role: 'guest',
            dailyLimit: 0,
            syncEnabled: false,
            serverModels: {}
        };
    }
    
    // ==========================================
    // СТАТИСТИКА ПОЛЬЗОВАТЕЛЯ
    // ==========================================
    
    async getUserStats() {
        try {
            const data = await this.apiClient.get('/users/stats');
            
            if (data.success && data.stats) {
                return data.stats;
            }
            return null;
        } catch (err) {
            console.error('Get user stats error:', err);
            return null;
        }
    }
}

// Экспорт
window.AuthService = AuthService;
window.authService = new AuthService();

console.log('✅ AuthService v2.0 загружен');
