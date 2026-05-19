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
# SSH 连接 (使用本地配置文件中的凭据)
ssh -i <path-to-key> -o StrictHostKeyChecking=no ubuntu@<server-ip>

# 部署后端
cd /var/www/tradingdoge/backend && pm2 restart tradingdoge-backend

# 重新加载 Nginx
sudo systemctl reload nginx
```

## 本地配置

服务器凭据保存在 `.claude/server-info.json`（本地专用，不上传到 GitHub）