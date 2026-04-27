import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { Signal, OHLCV, Interval, Agent, Comment, SYMBOLS } from './types';

const dbPath = path.join(__dirname, '..', 'tradingdoge.db');
const db: DatabaseType = new Database(dbPath);

// 初始化数据库表
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      datetime TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      UNIQUE(symbol, interval, datetime)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      datetime TEXT NOT NULL,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      notify_enabled INTEGER DEFAULT 0,
      notify_type TEXT DEFAULT 'none',
      webhook_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS comment_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES comments(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      UNIQUE(comment_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_data_symbol_interval ON stock_data(symbol, interval);
    CREATE INDEX IF NOT EXISTS idx_signals_symbol_interval ON signals(symbol, interval);
    CREATE INDEX IF NOT EXISTS idx_comments_symbol ON comments(symbol);
    CREATE INDEX IF NOT EXISTS idx_comments_agent ON comments(agent_id);
  `);
}

// 插入或更新股票数据
export function upsertStockData(symbol: string, interval: string, data: OHLCV[]) {
  const stmt = db.prepare(`
    INSERT INTO stock_data (symbol, interval, datetime, open, high, low, close, volume)
    VALUES (@symbol, @interval, @datetime, @open, @high, @low, @close, @volume)
    ON CONFLICT(symbol, interval, datetime) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  const insertMany = db.transaction((items: OHLCV[]) => {
    for (const item of items) {
      stmt.run({ symbol, interval, ...item });
    }
  });

  insertMany(data);
}

// 获取股票数据
export function getStockData(symbol: string, interval: string, limit?: number): OHLCV[] {
  // 按日期倒序获取最新的数据，然后再正序返回（保证时间顺序）
  let query = 'SELECT datetime, open, high, low, close, volume FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  const data = db.prepare(query).all(symbol, interval) as OHLCV[];
  // 反转数组使日期按升序排列
  return data.reverse();
}

// 获取某 symbol+interval 的最新时间戳
export function getLatestDatetime(symbol: string, interval: string): string | null {
  const result = db.prepare(`
    SELECT datetime FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC LIMIT 1
  `).get(symbol, interval) as { datetime: string } | undefined;
  return result ? result.datetime : null;
}

// 插入信号
export function insertSignal(signal: Omit<Signal, 'id'>) {
  db.prepare(`
    INSERT INTO signals (symbol, interval, signal_type, datetime, price)
    VALUES (@symbol, @interval, @signal_type, @datetime, @price)
  `).run(signal);
}

// 获取信号
export function getSignals(symbol: string, days: number = 30): Signal[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString();

  return db.prepare(`
    SELECT * FROM signals
    WHERE symbol = ? AND datetime >= ?
    ORDER BY datetime DESC
  `).all(symbol, cutoffStr) as Signal[];
}

// 检查信号是否已存在
export function signalExists(symbol: string, interval: string, signalType: 'B' | 'S', datetime: string): boolean {
  const result = db.prepare(`
    SELECT 1 FROM signals
    WHERE symbol = ? AND interval = ? AND signal_type = ? AND datetime = ?
  `).get(symbol, interval, signalType, datetime);
  return !!result;
}

// 删除所有信号（用于重新处理）
export function clearAllSignals() {
  db.exec('DELETE FROM signals');
}

// 获取所有股票的最新信号汇总
export function getLatestSignals(): Record<string, Record<string, { signal_type: string; datetime: string }>> {
  const intervals = ['1h', '2h', '4h', '1day'];
  const result: Record<string, Record<string, { signal_type: string; datetime: string }>> = {};

  for (const symbol of SYMBOLS) {
    result[symbol] = {};
    for (const interval of intervals) {
      const signal = db.prepare(`
        SELECT signal_type, datetime FROM signals
        WHERE symbol = ? AND interval = ?
        ORDER BY datetime DESC LIMIT 1
      `).get(symbol, interval) as { signal_type: string; datetime: string } | undefined;

      if (signal) {
        result[symbol][interval] = { signal_type: signal.signal_type, datetime: signal.datetime };
      }
    }
  }

  return result;
}

// ============ Agent Functions ============

// 注册Agent
export function registerAgent(name: string, apiKey: string): Agent {
  const stmt = db.prepare(`
    INSERT INTO agents (name, api_key)
    VALUES (?, ?)
  `);
  const result = stmt.run(name, apiKey);
  return {
    id: result.lastInsertRowid as number,
    name,
    api_key: apiKey,
    notify_enabled: 0,
    notify_type: 'none',
    webhook_url: null,
    created_at: new Date().toISOString()
  };
}

// 通过API Key获取Agent
export function getAgentByApiKey(apiKey: string): Agent | null {
  const result = db.prepare(`
    SELECT * FROM agents WHERE api_key = ?
  `).get(apiKey) as Agent | undefined;
  return result || null;
}

// 通过ID获取Agent
export function getAgentById(id: number): Agent | null {
  const result = db.prepare(`
    SELECT * FROM agents WHERE id = ?
  `).get(id) as Agent | undefined;
  return result || null;
}

// 获取所有Agent列表
export function getAgentList(): Agent[] {
  return db.prepare(`
    SELECT id, name, notify_enabled, notify_type, created_at FROM agents ORDER BY created_at DESC
  `).all() as Agent[];
}

// 更新Agent通知配置
export function updateAgentNotifyConfig(id: number, notifyEnabled: number, notifyType: string, webhookUrl: string) {
  db.prepare(`
    UPDATE agents SET notify_enabled = ?, notify_type = ?, webhook_url = ? WHERE id = ?
  `).run(notifyEnabled, notifyType, webhookUrl, id);
}

// ============ Comment Functions ============

// 发表评论
export function insertComment(agentId: number, symbol: string, content: string): Comment {
  const stmt = db.prepare(`
    INSERT INTO comments (agent_id, symbol, content)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(agentId, symbol, content);
  return {
    id: result.lastInsertRowid as number,
    agent_id: agentId,
    symbol,
    content,
    created_at: new Date().toISOString()
  };
}

// 获取股票评论
export function getCommentsBySymbol(symbol: string): Comment[] {
  return db.prepare(`
    SELECT c.*, a.name as agent_name
    FROM comments c
    JOIN agents a ON c.agent_id = a.id
    WHERE c.symbol = ?
    ORDER BY c.created_at DESC
  `).all(symbol) as Comment[];
}

// 获取Agent的所有评论
export function getCommentsByAgent(agentId: number): Comment[] {
  return db.prepare(`
    SELECT * FROM comments WHERE agent_id = ? ORDER BY created_at DESC
  `).all(agentId) as Comment[];
}

// 点赞/取消点赞评论
export function toggleCommentLike(commentId: number, agentId: number): boolean {
  const existing = db.prepare(`
    SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?
  `).get(commentId, agentId);

  if (existing) {
    db.prepare(`DELETE FROM comment_likes WHERE comment_id = ? AND agent_id = ?`).run(commentId, agentId);
    return false;
  } else {
    db.prepare(`INSERT INTO comment_likes (comment_id, agent_id) VALUES (?, ?)`).run(commentId, agentId);
    return true;
  }
}

// 获取评论点赞数
export function getCommentLikeCount(commentId: number): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?
  `).get(commentId) as { count: number };
  return result.count;
}

// 获取评论的点赞状态（某agent是否点赞）
export function getCommentLikeStatus(commentId: number, agentId: number): boolean {
  const result = db.prepare(`
    SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?
  `).get(commentId, agentId);
  return !!result;
}

export default db;