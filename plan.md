# 计划：全 B/全 S 时的止盈止损 + 邮件提醒

## 背景

当所有时间周期（1h, 2h, 4h, 1day）的信号全是 B 或全是 S 时，需要：
1. 计算建议开仓价、止盈价、止损价（基于 Price Action）
2. 发送邮件提醒
3. 在 profile 页面记录提醒时间、是建议 B 还是 S、以及当前股价、开仓/止损/止盈

## Price Action 计算逻辑（已实现）

### 核心概念

不依赖技术指标，看裸 K 线：
- 识别关键支撑/阻力位
- 等待价格回撤到支撑位入场
- 止损放在关键支撑/阻力位外侧
- 止盈放在下一个阻力位

### 计算步骤

#### Step 1: 找关键价位
- **支撑位 (Support)**：最近 20 天的最低点
- **阻力位 (Resistance)**：最近 20 天的最高点

#### Step 2: 开仓价 (Entry)
- 做多 (B)：等价格回撤到支撑位附近时入场
  - 如果当前价 - 支撑 > 2×ATR，建议等回撤到支撑 + 0.5×ATR 入场
  - 否则现价入场
- 做空 (S)：等价格反弹到阻力位附近时入场

#### Step 3: 止损价 (Stop Loss)
- 做多：支撑 - 1×ATR
- 做空：阻力 + 1×ATR

#### Step 4: 止盈价 (Take Profit)
- 做多：放到阻力位
- 做空：放到支撑位

### 示例（测试数据）

```
Support: 512 Resistance: 566
做多 (B): Entry: 520.00 SL: 496.00 TP: 566.00
做空 (S): Entry: 562.00 SL: 582.00 TP: 512.00
```

## 当前系统分析

### 信号逻辑
- `backend/src/signals.ts`: 检测 MA25 > MA90 为 B，MA25 < MA90 为 S
- `checkAndNotifyAllBSignal(symbol)`: 检查单个股票的所有周期 (1h, 2h, 4h, 1day) 是否全 B 或全 S
- `backend/src/notifier.ts`: 当前通知功能已禁用

### 用户收藏
- `user_favorites` 表存储用户的关注股票
- API: `/api/user/favorites` 获取用户收藏

### 数据库结构
- `users` 表有 `email` 字段

## 待实现功能

### 1. 提醒记录表（新增）

```sql
CREATE TABLE IF NOT EXISTS user_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  price REAL NOT NULL,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 2. 发送邮件通知（修改 notifier.ts）

- 本地开发仅记录日志
- 生产环境发送真实邮件（配置 SMTP）
- 包含：开仓价、止损价、止盈价

### 3. 数据库函数

- `saveUserAlert(userId, symbol, alertType, price, entry, sl, tp)`
- `getUserAlerts(userId)`

### 4. API 路由

- `GET /api/user/alerts` - 获取提醒历史

### 5. 前端 Profile 页面

- 显示提醒历史（时间、股票、方向、开仓/止损/止盈）

## 关键文件修改

1. `backend/src/signals.ts` - ✅ 已实现 Price Action 计算
2. `backend/src/database.ts` - 待添加表和函数
3. `backend/src/notifier.ts` - 待更新邮件内容
4. `backend/src/api.ts` - 待新增 API
5. `frontend/src/pages/Profile.tsx` - 待添加显示

## 验证方式

1. 启动开发服务器
2. 检查日志输出 Price Action 各价位
3. 调用 API 验证数据保存
4. 访问 profile 页面查看