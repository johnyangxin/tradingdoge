# CLAUDE.md

## Project Overview

TradingDoge - Stock display web application with TradingView charts and moving averages.

## Supported Stocks

- SPY - S&P 500 ETF
- BTC/USD - Bitcoin
- UVIX - Invesco NASDAQ 100 Low Volatility ETN
- GLD - SPDR Gold Shares

## 数据获取

数据获取在腾讯云服务器上通过 cron job 定时执行，不依赖 Vercel。

```bash
# 手动触发数据获取（在服务器上执行）
ssh ... "cd /var/www/tradingdoge/backend && npm run fetch:local"
```

定时任务配置在 `/etc/crontab`：
- 每天 23:00 UTC (19:00 ET)
- 每天 01:00 UTC (21:00 ET)

日志文件：`/var/log/tradingdoge-fetch.log`

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

## Cloudflare 配置

- **SSL 模式**：Flexible（Cloudflare → 源服务器走 HTTP，用户 → Cloudflare 走 HTTPS）
- **Cache Rule**：`/api/*` 路径设置为 Bypass cache，防止 API 响应被缓存
- **注意**：不要在 Cloudflare Workers 里添加 `tradingdoge.com/api/*` 路由，否则会拦截请求返回旧数据，导致后端修复无效

## 本地配置

服务器凭据保存在 `.claude/server-info.json`（本地专用，不上传到 GitHub）

---

# Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```