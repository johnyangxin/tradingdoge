# CLAUDE.md

## Project Overview

TradingDoge - Stock display web application with TradingView charts and moving averages.

## Supported Stocks

- SPY - S&P 500 ETF
- BTC/USD - Bitcoin
- UVIX - Invesco NASDAQ 100 Low Volatility ETN
- GLD - SPDR Gold Shares

## Custom Skills

- /fetch-data: 获取股票数据
- /local-init: 启动本地开发环境（backend + frontend 同时运行）
- /server-deploy: 部署到腾讯云服务器

## Deploy Commands

```bash
# === 步骤 1: 本地推送到 GitHub ===
git add <files>
git commit -m "描述"
git push origin main

# === 步骤 2: SSH 到服务器拉取代码 ===
ssh -i <path-to-key> -o StrictHostKeyChecking=no ubuntu@<server-ip>
cd /var/www/tradingdoge && git pull origin main

# === 步骤 3: 重启服务 ===
cd /var/www/tradingdoge/backend && npm install && pm2 restart tradingdoge-backend
sudo systemctl reload nginx
```

## 备用方案（服务器无法 git pull 时）

如果服务器 SSH 无法从 GitHub pull，可以使用备用方案通过 SSH 上传文件：

```bash
# 方案 A: 直接通过 SSH 执行命令（需要本地编译）
npm run build  # 本地构建 frontend
scp -r frontend/dist/* ubuntu@<server-ip>:/var/www/tradingdoge/frontend/dist/

# 方案 B: 只重启现有服务
ssh ... "pm2 restart tradingdoge-backend && sudo systemctl reload nginx"
```

## 本地配置

服务器凭据保存在 `.claude/server-info.json`（本地专用，不上传到 GitHub）