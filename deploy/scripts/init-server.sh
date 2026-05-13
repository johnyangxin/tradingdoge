#!/bin/bash
# TradingDoge 服务器初始化脚本

set -e

echo "=== TradingDoge 服务器初始化 ==="

# 1. 创建部署用户
echo "[1/6] 创建部署用户..."
if ! id deploy &>/dev/null; then
    sudo adduser --gecos "" deploy
    sudo usermod -aG sudo deploy
    echo "用户 deploy 已创建"
else
    echo "用户 deploy 已存在"
fi

# 2. 安装 Node.js 18
echo "[2/6] 安装 Node.js 18..."
if ! command -v node &>/dev/null || [[ "$(node -v)" < "v18" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "Node.js 已安装: $(node -v)"
else
    echo "Node.js 已安装: $(node -v)"
fi

# 3. 安装 Nginx
echo "[3/6] 安装 Nginx..."
sudo apt install -y nginx
echo "Nginx 已安装"

# 4. 安装 PM2
echo "[4/6] 安装 PM2..."
sudo npm install -g pm2
echo "PM2 已安装: $(pm2 -v)"

# 5. 配置 PM2 开机自启
echo "[5/6] 配置 PM2 开机自启..."
sudo pm2 startup -u deploy 2>/dev/null || true
sudo env PATH="$PATH:/usr/local/bin" PM2_HOME="/home/deploy/.pm2" sudo env `sudo env` | sudo tee /etc/init.d/pm2-init 2>/dev/null || true

# 6. 创建项目目录
echo "[6/6] 创建项目目录..."
sudo mkdir -p /var/www/tradingdoge
sudo chown -R deploy:deploy /var/www/tradingdoge

echo ""
echo "=== 初始化完成 ==="
echo ""
echo "下一步："
echo "1. 将代码复制到 /var/www/tradingdoge"
echo "2. 配置 Nginx（运行以下命令）"
echo "3. 启动服务：pm2 start backend/src/index.ts --name tradingdoge-backend"
echo ""