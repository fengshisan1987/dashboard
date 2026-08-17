# 招商端数据看板 - 部署说明

## 架构

- **前端**: 纯静态 HTML + JS + CSS
- **后端**: Node.js + Express
- **数据存储**: 服务器本地 JSON 文件
- **部署**: Nginx 反向代理 + PM2 进程管理
- **备份**: 每周日自动备份，保留最近4周

## 文件结构

```
dashboard/
├── index.html          # 前端主页面
├── api.js              # API 服务层
├── chart.umd.min.js    # Chart.js
├── xlsx.full.min.js    # XLSX.js
└── ...                 # 其他前端文件

dashboard-backend/
├── server.js           # 后端主服务
├── package.json        # 依赖配置
├── pm2.config.json     # PM2 进程配置
├── nginx.conf          # Nginx 配置模板
├── deploy.sh           # 一键部署脚本
├── data/               # 数据文件目录
│   ├── clue_data.json
│   ├── cost_data.json
│   └── auth.json
└── backups/            # 备份文件目录
```

## 部署步骤

### 1. 准备服务器

- 阿里云 ECS（CentOS 7/8 或 Ubuntu）
- 开放 80 端口
- 域名解析（可选）

### 2. 上传代码到 GitHub

```bash
# 在本地项目目录执行
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/fengshisan1987/dashboard.git
git push -u origin main
```

### 3. 服务器上执行部署

```bash
# 下载部署脚本
wget https://raw.githubusercontent.com/fengshisan1987/dashboard/main/dashboard-backend/deploy.sh

# 执行部署
bash deploy.sh
```

### 4. 访问

- 前台: http://你的服务器IP
- API: http://你的服务器IP/api/health

## 默认账号

- 用户名: `admin`
- 密码: `admin123`
- 角色: 超级管理员

## 备份策略

- **自动备份**: 每周日凌晨2点
- **保留数量**: 最近4周
- **手动备份**: `curl -X POST http://localhost:3005/api/backup`
- **恢复备份**: 通过 API 调用

## 常用命令

```bash
# 查看后端日志
pm2 logs dashboard-backend

# 重启后端
pm2 restart dashboard-backend

# 查看Nginx状态
systemctl status nginx

# 手动备份
curl -X POST http://localhost:3005/api/backup

# 查看备份列表
curl http://localhost:3005/api/backups
```

## API 接口

### 认证
- `POST /api/auth/login` - 登录
- `GET /api/auth/accounts` - 获取账号列表
- `POST /api/auth/accounts` - 添加账号
- `DELETE /api/auth/accounts/:username` - 删除账号
- `PUT /api/auth/accounts/:username/password` - 修改密码

### 线索数据
- `GET /api/clue/data` - 获取线索数据
- `POST /api/clue/data` - 保存线索数据

### 消耗数据
- `GET /api/cost/data` - 获取消耗数据
- `POST /api/cost/data` - 保存消耗数据

### 备份
- `POST /api/backup` - 手动备份
- `GET /api/backups` - 获取备份列表
- `POST /api/backup/restore` - 恢复备份

### 健康检查
- `GET /api/health` - 服务状态
