// API服务层 - 替代localStorage，调用后端API
const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3005' : '';

class DashboardAPI {
    constructor() {
        this.token = null;
    }

    // 设置认证token
    setToken(token) {
        this.token = token;
        localStorage.setItem('dashboard_token', token);
    }

    // 获取认证token
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('dashboard_token');
        }
        return this.token;
    }

    // 清除认证
    clearAuth() {
        this.token = null;
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_user');
    }

    // 通用请求方法
    async request(url, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${API_BASE}${url}`, {
                ...options,
                headers
            });

            if (response.status === 401) {
                this.clearAuth();
                window.location.reload();
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('API请求失败:', error);
            throw error;
        }
    }

    // ========== 认证相关 ==========
    
    async login(username, password) {
        const result = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        if (result && result.success) {
            this.setToken(result.user.username); // 简单token，实际应用应使用JWT
            localStorage.setItem('dashboard_user', JSON.stringify(result.user));
        }
        
        return result;
    }

    async getAccounts() {
        return this.request('/api/auth/accounts');
    }

    async addAccount(username, password, role) {
        return this.request('/api/auth/accounts', {
            method: 'POST',
            body: JSON.stringify({ username, password, role })
        });
    }

    async deleteAccount(username) {
        return this.request(`/api/auth/accounts/${username}`, {
            method: 'DELETE'
        });
    }

    async changePassword(username, newPassword) {
        return this.request(`/api/auth/accounts/${username}/password`, {
            method: 'PUT',
            body: JSON.stringify({ newPassword })
        });
    }

    // ========== 线索数据 ==========
    
    async getClueData() {
        const result = await this.request('/api/clue/data');
        return result || { data: [], lastUpdate: null };
    }

    async saveClueData(data) {
        return this.request('/api/clue/data', {
            method: 'POST',
            body: JSON.stringify({ data })
        });
    }

    // ========== 消耗数据 ==========
    
    async getCostData() {
        const result = await this.request('/api/cost/data');
        return result || { data: {}, accounts: [], lastUpdate: null };
    }

    async saveCostData(data, accounts) {
        return this.request('/api/cost/data', {
            method: 'POST',
            body: JSON.stringify({ data, accounts })
        });
    }

    // ========== 备份 ==========
    
    async createBackup() {
        return this.request('/api/backup', { method: 'POST' });
    }

    async getBackups() {
        return this.request('/api/backups');
    }

    async restoreBackup(backupName) {
        return this.request('/api/backup/restore', {
            method: 'POST',
            body: JSON.stringify({ backupName })
        });
    }

    // ========== 健康检查 ==========
    
    async health() {
        return this.request('/api/health');
    }
}

// 创建全局实例
window.dashboardAPI = new DashboardAPI();
