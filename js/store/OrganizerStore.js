// ============================================
// js/store/OrganizerStore.js
// Описание: To-Do, напоминания, трекеры
// ============================================

class OrganizerStore {
    constructor() {
        this.todoItems = [];
        this.reminders = [];
        this.trackers = [];
        this.trackerLogs = [];
        
        this.loadFromStorage();
    }
    
    // ==========================================
    // ЗАГРУЗКА / СОХРАНЕНИЕ
    // ==========================================
    
    getUserId() {
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        return user?.id || 'anonymous';
    }
    
    loadFromStorage() {
        const userId = this.getUserId();
        const prefix = `organizer_${userId}`;
        
        try {
            this.todoItems = JSON.parse(localStorage.getItem(`${prefix}_todo`) || '[]');
            this.reminders = JSON.parse(localStorage.getItem(`${prefix}_reminders`) || '[]');
            this.trackers = JSON.parse(localStorage.getItem(`${prefix}_trackers`) || '[]');
            this.trackerLogs = JSON.parse(localStorage.getItem(`${prefix}_tracker_logs`) || '[]');
        } catch (e) {
            console.error('Ошибка загрузки OrganizerStore:', e);
        }
    }
    
    saveToStorage() {
        const userId = this.getUserId();
        const prefix = `organizer_${userId}`;
        
        try {
            localStorage.setItem(`${prefix}_todo`, JSON.stringify(this.todoItems));
            localStorage.setItem(`${prefix}_reminders`, JSON.stringify(this.reminders));
            localStorage.setItem(`${prefix}_trackers`, JSON.stringify(this.trackers));
            localStorage.setItem(`${prefix}_tracker_logs`, JSON.stringify(this.trackerLogs));
        } catch (e) {
            console.error('Ошибка сохранения OrganizerStore:', e);
        }
    }
    
    generateId() {
        return 'org_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    }
    
    // ==========================================
    // TO-DO
    // ==========================================
    
    addTodo(text, topic) {
        const item = {
            id: this.generateId(),
            text: text,
            topic: topic || window.currentTopic || 'code',
            isCompleted: false,
            createdAt: new Date().toISOString()
        };
        
        this.todoItems.unshift(item);
        this.saveToStorage();
        return item;
    }
    
    toggleTodo(id) {
        const item = this.todoItems.find(t => t.id === id);
        if (item) {
            item.isCompleted = !item.isCompleted;
            this.saveToStorage();
        }
        return item;
    }
    
    deleteTodo(id) {
        this.todoItems = this.todoItems.filter(t => t.id !== id);
        this.saveToStorage();
    }
    
    getTodoByTopic(topic) {
        return this.todoItems.filter(t => t.topic === topic);
    }
    
    getTodoStats(topic) {
        const items = topic ? this.getTodoByTopic(topic) : this.todoItems;
        const total = items.length;
        const completed = items.filter(t => t.isCompleted).length;
        return { total, completed, pending: total - completed };
    }
    
    // ==========================================
    // НАПОМИНАНИЯ (локальный кэш)
    // ==========================================
    
    setReminders(reminders) {
        this.reminders = reminders;
        this.saveToStorage();
    }
    
    addReminder(reminder) {
        this.reminders.push(reminder);
        this.saveToStorage();
        return reminder;
    }
    
    deleteReminder(id) {
        this.reminders = this.reminders.filter(r => r.id !== id);
        this.saveToStorage();
    }
    
    getRemindersByTopic(topic) {
        return this.reminders.filter(r => r.topic_id === topic && r.status === 'pending');
    }
    
    // ==========================================
    // ТРЕКЕРЫ (локальный кэш)
    // ==========================================
    
    setTrackers(trackers, logs) {
        this.trackers = trackers || [];
        this.trackerLogs = logs || [];
        this.saveToStorage();
    }
    
    addTracker(tracker) {
        this.trackers.push(tracker);
        this.saveToStorage();
        return tracker;
    }
    
    deleteTracker(id) {
        this.trackers = this.trackers.filter(t => t.id !== id);
        this.trackerLogs = this.trackerLogs.filter(l => l.tracker_id !== id);
        this.saveToStorage();
    }
    
    addTrackerLog(log) {
        this.trackerLogs.push(log);
        this.saveToStorage();
        return log;
    }
    
    deleteTrackerLog(id) {
        this.trackerLogs = this.trackerLogs.filter(l => l.id !== id);
        this.saveToStorage();
    }
    
    getTrackersByTopic(topic) {
        return this.trackers.filter(t => t.topic_id === topic && t.status === 'active');
    }
    
    getLogsForTracker(trackerId) {
        return this.trackerLogs
            .filter(l => l.tracker_id === trackerId)
            .sort((a, b) => new Date(b.logged_date) - new Date(a.logged_date));
    }
}

// Экспортируем как глобальный объект
window.OrganizerStore = OrganizerStore;
window.organizerStore = new OrganizerStore();

console.log('✅ OrganizerStore загружен');
