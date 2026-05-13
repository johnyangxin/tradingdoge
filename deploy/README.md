# TradingDoge 腾讯云部署指南

## 服务器初始化

### 方式 1: 一键脚本（推荐）
```bash
# 服务器上执行
curl -fsSL https://raw.githubusercontent.com/johnxyzyang/tradingdoge/main/deploy/scripts/init-server.sh | bash
```

### 方式 2: 手动执行
```bash
# 1. 连接服务器
ssh root@你的服务器IP

# 2. 创建部署用户
adduser deploy
usermod -aG sudo deploy

# 3. 安装依赖
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs nginx git
npm install -g pm2

# 4. 创建目录
mkdir -p /var/www/tradingdoge
chown -R deploy:deploy /var/www/tradingdoge
```

## GitHub Secrets 配置

在 GitHub 仓库 settings → Secrets 添加：

| Secret | 值 |
|--------|-----|
| SERVER_HOST | 服务器 IP 地址 |
| SERVER_USER | deploy |
| SERVER_SSH_KEY | 部署用户私钥（id_rsa 内容） |

### 生成 SSH 密钥
```bash
# 本地执行
ssh-keygen -t rsa -b 4096 -C "deploy@tradingdoge"

# 复制公钥到服务器
ssh-copy-id -i ~/.ssh/id_rsa.pub deploy@你的服务器IP
```

## 部署流程

1. **推送代码到 GitHub**
   ```bash
   git add .
   git commit -m "deploy to tencent cloud"
   git push origin main
   ```

2. **GitHub Actions 自动部署**
   - 打开 GitHub → Actions 查看部署状态
   - 部署完成后，在服务器上检查状态：
   ```bash
   pm2 status
   ```

## 定时抓取配置

服务器上添加 cron 任务：
```bash
# 编辑 crontab
crontab -u deploy -e

# 添加定时任务（每天 16:00 UTC = 00:00 北京时间）
0 16 * * 1-5 cd /var/www/tradingdoge/backend && npm run fetch >> /var/log/tradingdoge-fetch.log 2>&1
```

## 常用命令

```bash
# 查看日志
pm2 logs tradingdoge-backend

# 重启服务
pm2 restart all

# 查看状态
pm2 status
```

## 目录结构

```
/var/www/tradingdoge/
├── backend/         # 后端代码
│   ├── src/
│   └── package.json
├── frontend/       # 前端构建
│   ├── dist/       # 静态文件
│   └── index.html
└── .env           # 环境变量
```

## 故障排查

```bash
# 检查服务状态
pm2 status

# 检查日志
pm2 logs tradingdoge-backend --lines 50

# 检查端口占用
lsof -i :3004

# 检查 Nginx
nginx -t
systemctl status nginx
```