const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const CLUE_DATA_FILE = path.join(DATA_DIR, 'clue_data.json');
const COST_DATA_FILE = path.join(DATA_DIR, 'cost_data.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const LOG_FILE = path.join(DATA_DIR, 'operation_logs.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// JWT密钥（实际生产环境应该使用环境变量）
const JWT_SECRET = 'dashboard-secret-key-2024';
const TOKEN_EXPIRE_HOURS = 24; // 登录有效期24小时

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// 默认账号配置
const DEFAULT_ACCOUNTS = [
    { username: 'admin', password: 'admin123', role: 'superadmin', createdAt: new Date().toISOString() }
];

// ========== 初始化文件 ==========
function initAuthFile() {
    if (!fs.existsSync(AUTH_FILE)) {
        fs.writeFileSync(AUTH_FILE, JSON.stringify({ accounts: DEFAULT_ACCOUNTS }, null, 2));
    }
}

function initClueDataFile() {
    if (!fs.existsSync(CLUE_DATA_FILE)) {
        fs.writeFileSync(CLUE_DATA_FILE, JSON.stringify({ data: [], lastUpdate: null }, null, 2));
    }
}

function initCostDataFile() {
    if (!fs.existsSync(COST_DATA_FILE)) {
        fs.writeFileSync(COST_DATA_FILE, JSON.stringify({ data: {}, accounts: [], lastUpdate: null }, null, 2));
    }
}

function initLogFile() {
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, JSON.stringify({ logs: [] }, null, 2));
    }
}

// ========== 读取/保存数据 ==========
function readAuthData() {
    try {
        initAuthFile();
        return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    } catch (e) {
        return { accounts: DEFAULT_ACCOUNTS };
    }
}

function saveAuthData(data) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function readClueData() {
    try {
        initClueDataFile();
        return JSON.parse(fs.readFileSync(CLUE_DATA_FILE, 'utf8'));
    } catch (e) {
        return { data: [], lastUpdate: null };
    }
}

function saveClueData(data) {
    fs.writeFileSync(CLUE_DATA_FILE, JSON.stringify(data, null, 2));
}

function readCostData() {
    try {
        initCostDataFile();
        return JSON.parse(fs.readFileSync(COST_DATA_FILE, 'utf8'));
    } catch (e) {
        return { data: {}, accounts: [], lastUpdate: null };
    }
}

function saveCostData(data) {
    fs.writeFileSync(COST_DATA_FILE, JSON.stringify(data, null, 2));
}

function readLogs() {
    try {
        initLogFile();
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (e) {
        return { logs: [] };
    }
}

function saveLogs(data) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

// ========== JWT 简单实现 ==========
function generateToken(username, role) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        username,
        role,
        iat: now,
        exp: now + TOKEN_EXPIRE_HOURS * 3600
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url');
    return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
            .update(`${header}.${payload}`)
            .digest('base64url');
        if (signature !== expectedSignature) return null;
        
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        const now = Math.floor(Date.now() / 1000);
        if (data.exp < now) return null; // 令牌过期
        return data;
    } catch (e) {
        return null;
    }
}

// ========== 认证中间件 ==========
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }
    
    const user = verifyToken(token);
    if (!user) {
        return res.status(403).json({ success: false, message: '令牌无效或已过期' });
    }
    
    req.user = user;
    next();
}

function requireSuperAdmin(req, res, next) {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: '需要超级管理员权限' });
    }
    next();
}

// ========== 操作日志 ==========
function addLog(username, action, details = '') {
    try {
        const logs = readLogs();
        logs.logs.unshift({
            time: new Date().toISOString(),
            username,
            action,
            details,
            ip: '' // 可以添加IP地址
        });
        // 只保留最近1000条日志
        if (logs.logs.length > 1000) {
            logs.logs = logs.logs.slice(0, 1000);
        }
        saveLogs(logs);
    } catch (e) {
        console.error('记录日志失败:', e);
    }
}

// ========== 备份功能 ==========
function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup_${timestamp}`);
    
    if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
    }
    
    if (fs.existsSync(CLUE_DATA_FILE)) {
        fs.copyFileSync(CLUE_DATA_FILE, path.join(backupPath, 'clue_data.json'));
    }
    if (fs.existsSync(COST_DATA_FILE)) {
        fs.copyFileSync(COST_DATA_FILE, path.join(backupPath, 'cost_data.json'));
    }
    if (fs.existsSync(AUTH_FILE)) {
        fs.copyFileSync(AUTH_FILE, path.join(backupPath, 'auth.json'));
    }
    
    console.log(`[${new Date().toISOString()}] 备份完成: ${backupPath}`);
    return backupPath;
}

function cleanupOldBackups() {
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(name => name.startsWith('backup_'))
        .map(name => ({
            name,
            path: path.join(BACKUP_DIR, name),
            time: fs.statSync(path.join(BACKUP_DIR, name)).mtime
        }))
        .sort((a, b) => b.time - a.time);
    
    const toDelete = backups.slice(4);
    toDelete.forEach(backup => {
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`[${new Date().toISOString()}] 删除旧备份: ${backup.name}`);
    });
}

function scheduleWeeklyBackup() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    nextSunday.setHours(2, 0, 0, 0);
    
    if (nextSunday <= now) {
        nextSunday.setDate(nextSunday.getDate() + 7);
    }
    
    const delay = nextSunday - now;
    
    setTimeout(() => {
        createBackup();
        cleanupOldBackups();
        setInterval(() => {
            createBackup();
            cleanupOldBackups();
        }, 7 * 24 * 60 * 60 * 1000);
    }, delay);
    
    console.log(`[${new Date().toISOString()}] 下次备份时间: ${nextSunday.toISOString()}`);
}

// ========== 认证相关 API ==========

// 登录验证
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const authData = readAuthData();
    
    const account = authData.accounts.find(a => a.username === username && a.password === password);
    
    if (account) {
        const token = generateToken(account.username, account.role);
        addLog(username, '登录', '用户登录成功');
        res.json({ 
            success: true, 
            token,
            user: {
                username: account.username,
                role: account.role
            }
        });
    } else {
        res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
});

// 获取当前用户信息
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// 获取所有账号（仅超级管理员）
app.get('/api/auth/accounts', authenticateToken, requireSuperAdmin, (req, res) => {
    const authData = readAuthData();
    const accounts = authData.accounts.map(a => ({
        username: a.username,
        role: a.role,
        createdAt: a.createdAt
    }));
    res.json({ success: true, accounts });
});

// 添加账号（仅超级管理员）
app.post('/api/auth/accounts', authenticateToken, requireSuperAdmin, (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    const authData = readAuthData();
    
    if (authData.accounts.find(a => a.username === username)) {
        return res.status(409).json({ success: false, message: '账号已存在' });
    }
    
    authData.accounts.push({
        username,
        password,
        role,
        createdAt: new Date().toISOString()
    });
    
    saveAuthData(authData);
    addLog(req.user.username, '创建账号', `创建用户: ${username}, 角色: ${role}`);
    res.json({ success: true, message: '账号创建成功' });
});

// 删除账号（仅超级管理员）
app.delete('/api/auth/accounts/:username', authenticateToken, requireSuperAdmin, (req, res) => {
    const { username } = req.params;
    
    if (username === 'admin') {
        return res.status(403).json({ success: false, message: '不能删除默认管理员账号' });
    }
    
    const authData = readAuthData();
    const index = authData.accounts.findIndex(a => a.username === username);
    
    if (index === -1) {
        return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    authData.accounts.splice(index, 1);
    saveAuthData(authData);
    addLog(req.user.username, '删除账号', `删除用户: ${username}`);
    res.json({ success: true, message: '账号删除成功' });
});

// 修改密码（任何登录用户都可以修改自己的密码，超级管理员可以修改任何密码）
app.put('/api/auth/accounts/:username/password', authenticateToken, (req, res) => {
    const { username } = req.params;
    const { newPassword } = req.body;
    
    // 普通用户只能修改自己的密码
    if (req.user.role !== 'superadmin' && req.user.username !== username) {
        return res.status(403).json({ success: false, message: '只能修改自己的密码' });
    }
    
    if (!newPassword) {
        return res.status(400).json({ success: false, message: '新密码不能为空' });
    }
    
    const authData = readAuthData();
    const account = authData.accounts.find(a => a.username === username);
    
    if (!account) {
        return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    account.password = newPassword;
    saveAuthData(authData);
    addLog(req.user.username, '修改密码', `修改用户: ${username} 的密码`);
    res.json({ success: true, message: '密码修改成功' });
});

// ========== 线索数据 API ==========

// 获取线索数据（任何登录用户）
app.get('/api/clue/data', authenticateToken, (req, res) => {
    res.json(readClueData());
});

// 保存线索数据（仅超级管理员）
app.post('/api/clue/data', authenticateToken, requireSuperAdmin, (req, res) => {
    const data = {
        data: req.body.data || [],
        lastUpdate: new Date().toISOString()
    };
    saveClueData(data);
    addLog(req.user.username, '保存线索数据', `保存了 ${data.data.length} 条线索数据`);
    res.json({ success: true, message: '数据保存成功' });
});

// ========== 消耗数据 API ==========

// 获取消耗数据（任何登录用户）
app.get('/api/cost/data', authenticateToken, (req, res) => {
    res.json(readCostData());
});

// 保存消耗数据（仅超级管理员）
app.post('/api/cost/data', authenticateToken, requireSuperAdmin, (req, res) => {
    const data = {
        data: req.body.data || {},
        accounts: req.body.accounts || [],
        lastUpdate: new Date().toISOString()
    };
    saveCostData(data);
    addLog(req.user.username, '保存消耗数据', `保存了消耗数据`);
    res.json({ success: true, message: '消耗数据保存成功' });
});

// ========== 备份 API ==========

// 手动触发备份（仅超级管理员）
app.post('/api/backup', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const backupPath = createBackup();
        cleanupOldBackups();
        addLog(req.user.username, '手动备份', `备份路径: ${backupPath}`);
        res.json({ success: true, message: '备份完成', path: backupPath });
    } catch (e) {
        res.status(500).json({ success: false, message: '备份失败: ' + e.message });
    }
});

// 获取备份列表（仅超级管理员）
app.get('/api/backups', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(name => name.startsWith('backup_'))
            .map(name => ({
                name,
                time: fs.statSync(path.join(BACKUP_DIR, name)).mtime.toISOString()
            }))
            .sort((a, b) => new Date(b.time) - new Date(a.time));
        
        res.json({ success: true, backups });
    } catch (e) {
        res.status(500).json({ success: false, message: '获取备份列表失败' });
    }
});

// 恢复备份（仅超级管理员）
app.post('/api/backup/restore', authenticateToken, requireSuperAdmin, (req, res) => {
    const { backupName } = req.body;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ success: false, message: '备份不存在' });
    }
    
    try {
        createBackup();
        
        if (fs.existsSync(path.join(backupPath, 'clue_data.json'))) {
            fs.copyFileSync(path.join(backupPath, 'clue_data.json'), CLUE_DATA_FILE);
        }
        if (fs.existsSync(path.join(backupPath, 'cost_data.json'))) {
            fs.copyFileSync(path.join(backupPath, 'cost_data.json'), COST_DATA_FILE);
        }
        
        addLog(req.user.username, '恢复备份', `恢复备份: ${backupName}`);
        res.json({ success: true, message: '数据恢复成功' });
    } catch (e) {
        res.status(500).json({ success: false, message: '恢复失败: ' + e.message });
    }
});

// ========== 操作日志 API ==========

// 获取操作日志（仅超级管理员）
app.get('/api/logs', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const logs = readLogs();
        res.json({ success: true, logs: logs.logs });
    } catch (e) {
        res.status(500).json({ success: false, message: '获取日志失败' });
    }
});

// ========== 健康检查 ==========

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        dataDir: fs.existsSync(DATA_DIR),
        backupDir: fs.existsSync(BACKUP_DIR)
    });
});

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, '../dashboard')));

// 启动服务器
const PORT = process.env.PORT || 3005;

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`========================================`);
        console.log(`  招商端数据看板 API 服务`);
        console.log(`========================================`);
        console.log(`服务器运行在端口: ${port}`);
        console.log(`数据目录: ${DATA_DIR}`);
        console.log(`备份目录: ${BACKUP_DIR}`);
        console.log(`登录有效期: ${TOKEN_EXPIRE_HOURS}小时`);
        console.log(`API地址: http://localhost:${port}/api`);
        console.log(`========================================`);
        
        scheduleWeeklyBackup();
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`端口 ${port} 被占用，尝试端口 ${port + 1}`);
            startServer(port + 1);
        } else {
            console.error('服务器启动错误:', err);
        }
    });
}

startServer(PORT);
