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
        // 记录登录时间，用于检查过期
        localStorage.setItem('dashboard_login_time', Date.now().toString());
    }

    // 获取认证token
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('dashboard_token');
        }
        // 检查是否过期（24小时）
        const loginTime = localStorage.getItem('dashboard_login_time');
        if (loginTime) {
            const elapsed = Date.now() - parseInt(loginTime);
            if (elapsed > 24 * 3600 * 1000) {
                // 超过24小时，清除登录状态
                this.clearAuth();
                return null;
            }
        }
        return this.token;
    }

    // 清除认证
    clearAuth() {
        this.token = null;
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_user');
        localStorage.removeItem('dashboard_login_time');
    }

    // 检查是否已登录
    isLoggedIn() {
        return !!this.getToken();
    }

    // 获取当前用户角色
    getUserRole() {
        const user = localStorage.getItem('dashboard_user');
        if (user) {
            try {
                return JSON.parse(user).role;
            } catch (e) {
                return null;
            }
        }
        return null;
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

            if (response.status === 401 || response.status === 403) {
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
            this.setToken(result.token);
            localStorage.setItem('dashboard_user', JSON.stringify(result.user));
        }
        
        return result;
    }

    async getCurrentUser() {
        return this.request('/api/auth/me');
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

    // ========== 操作日志 ==========
    
    async getLogs() {
        return this.request('/api/logs');
    }

    // ========== 健康检查 ==========
    
    async health() {
        return this.request('/api/health');
    }
}

// 创建全局实例
window.dashboardAPI = new DashboardAPI();
