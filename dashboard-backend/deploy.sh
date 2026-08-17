#!/bin/bash
# 招商端数据看板部署脚本
# 使用方法：在服务器上执行 bash deploy.sh

set -e

echo "=========================================="
echo "  招商端数据看板 - 部署脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用 root 用户执行此脚本${NC}"
    echo "切换到root: sudo su -"
    exit 1
fi

# 配置
APP_DIR="/var/www/dashboard"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
GITHUB_REPO="https://github.com/fengshisan1987/dashboard.git"

echo -e "${GREEN}[1/10] 更新系统...${NC}"
yum update -y

echo -e "${GREEN}[2/10] 安装基础依赖...${NC}"
yum install -y curl wget git nginx

# 安装 Node.js 18
echo -e "${GREEN}[3/10] 安装 Node.js 18...${NC}"
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "18" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
fi

echo -e "${GREEN}Node.js 版本: $(node -v)${NC}"
echo -e "${GREEN}npm 版本: $(npm -v)${NC}"

# 安装 PM2
echo -e "${GREEN}[4/10] 安装 PM2...${NC}"
npm install -g pm2

# 创建应用目录
echo -e "${GREEN}[5/10] 创建应用目录...${NC}"
mkdir -p $APP_DIR
mkdir -p $BACKEND_DIR
mkdir -p $FRONTEND_DIR
mkdir -p $APP_DIR/logs

# 从 GitHub 克隆代码
echo -e "${GREEN}[6/10] 从 GitHub 克隆代码...${NC}"
cd $APP_DIR

if [ -d ".git" ]; then
    echo "代码已存在，执行更新..."
    git pull
else
    rm -rf *
    git clone $GITHUB_REPO .
fi

# 安装后端依赖
echo -e "${GREEN}[7/10] 安装后端依赖...${NC}"
cd $BACKEND_DIR
npm install

# 创建数据目录
echo -e "${GREEN}[8/10] 创建数据目录...${NC}"
mkdir -p $BACKEND_DIR/data
mkdir -p $BACKEND_DIR/backups

# 配置 Nginx
echo -e "${GREEN}[9/10] 配置 Nginx...${NC}"
cat > /etc/nginx/conf.d/dashboard.conf << EOF
server {
    listen 80;
    server_name _;
    
    location / {
        root $FRONTEND_DIR;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

# 测试 Nginx 配置
nginx -t

# 启动服务
echo -e "${GREEN}[10/10] 启动服务...${NC}"

# 启动后端
cd $BACKEND_DIR
pm2 delete dashboard-backend 2>/dev/null || true
pm2 start pm2.config.json
pm2 save
pm2 startup systemd -u root --hp /root

# 启动/重载 Nginx
systemctl enable nginx

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}Nginx 正在运行，执行平滑重载...${NC}"
    nginx -s reload
else
    echo -e "${GREEN}启动 Nginx...${NC}"
    systemctl start nginx
fi

# 配置防火墙
echo -e "${GREEN}配置防火墙...${NC}"
firewall-cmd --permanent --add-service=http 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true

echo ""
echo "=========================================="
echo -e "${GREEN}  部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址: http://你的服务器IP"
echo "API测试: http://你的服务器IP/api/health"
echo ""
echo "默认账号:"
echo "  用户名: admin"
echo "  密码: admin123"
echo ""
echo "常用命令:"
echo "  查看后端日志: pm2 logs dashboard-backend"
echo "  重启后端: pm2 restart dashboard-backend"
echo "  查看Nginx状态: systemctl status nginx"
echo "  手动备份: curl -X POST http://localhost:3005/api/backup"
echo ""
