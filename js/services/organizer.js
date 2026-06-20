// ============================================
// js/services/organizer.js
// Описание: API для органайзера (напоминания, трекеры)
// ============================================

class OrganizerService {
    constructor() {
        this.apiClient = window.apiClient;
        this.organizerStore = window.organizerStore;
        this.userStore = window.userStore;
    }
    
    // ==========================================
    // НАПОМИНАНИЯ
    // ==========================================
    
    async getReminders(topicId = null) {
        try {
            let url = '/organizer/reminders/get';
            if (topicId) {
                url += `?topicId=${encodeURIComponent(topicId)}`;
            }
            
            const data = await this.apiClient.get(url);
            
            if (data.success && data.data) {
                this.organizerStore.setReminders(data.data);
                return data.data;
            }
            return [];
        } catch (err) {
            console.error('Get reminders error:', err);
            return this.organizerStore.reminders;
        }
    }
    
    async createReminder(topicId, taskText, triggerAt) {
        try {
            const data = await this.apiClient.post('/organizer/reminders/create', {
                topicId: topicId,
                taskText: taskText,
                triggerAt: triggerAt
            });
            
            if (data.success && data.data) {
                this.organizerStore.addReminder(data.data);
                return data.data;
            }
            return null;
        } catch (err) {
            console.error('Create reminder error:', err);
            return null;
        }
    }
    
    async deleteReminder(id) {
        try {
            const data = await this.apiClient.post('/organizer/reminders/delete', {
                id: id
            });
            
            if (data.success) {
                this.organizerStore.deleteReminder(id);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Delete reminder error:', err);
            return false;
        }
    }
    
    // ==========================================
    // ТРЕКЕРЫ
    // ==========================================
    
    async getTrackers(topicId = null) {
        try {
            let url = '/organizer/trackers/get';
            if (topicId) {
                url += `?topicId=${encodeURIComponent(topicId)}`;
            }
            
            const data = await this.apiClient.get(url);
            
            if (data.success && data.data) {
                this.organizerStore.setTrackers(
                    data.data.trackers || [],
                    data.data.logs || []
                );
                return data.data;
            }
            return { trackers: [], logs: [] };
        } catch (err) {
            console.error('Get trackers error:', err);
            return {
                trackers: this.organizerStore.trackers,
                logs: this.organizerStore.trackerLogs
            };
        }
    }
    
    async createTracker(topicId, title, settings = {}) {
        try {
            const data = await this.apiClient.post('/organizer/trackers/create', {
                topicId: topicId,
                title: title,
                settings: settings
            });
            
            if (data.success && data.data) {
                this.organizerStore.addTracker(data.data);
                return data.data;
            }
            return null;
        } catch (err) {
            console.error('Create tracker error:', err);
            return null;
        }
    }
    
    async addTrackerLog(trackerId, value, noteText = null, loggedDate = null) {
        try {
            const data = await this.apiClient.post('/organizer/trackers/add-log', {
                trackerId: trackerId,
                value: value,
                noteText: noteText,
                loggedDate: loggedDate || new Date().toISOString()
            });
            
            if (data.success && data.data) {
                this.organizerStore.addTrackerLog(data.data);
                return data.data;
            }
            return null;
        } catch (err) {
            console.error('Add tracker log error:', err);
            return null;
        }
    }
    
    async deleteTrackerLog(id) {
        try {
            const data = await this.apiClient.post('/organizer/trackers/delete-log', {
                id: id
            });
            
            if (data.success) {
                this.organizerStore.deleteTrackerLog(id);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Delete tracker log error:', err);
            return false;
        }
    }
    
    async deleteTracker(id) {
        try {
            const data = await this.apiClient.post('/organizer/trackers/delete', {
                id: id
            });
            
            if (data.success) {
                this.organizerStore.deleteTracker(id);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Delete tracker error:', err);
            return false;
        }
    }
}

// Экспортируем как глобальный объект
window.OrganizerService = OrganizerService;
window.organizerService = new OrganizerService();

console.log('✅ OrganizerService загружен');
