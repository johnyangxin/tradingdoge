import { Signal, OHLCV, Interval, Agent, Comment, SYMBOLS } from './types';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Type for better-sqlite3 database
export interface SqlJsDatabase {
  exec(sql: string): void;
  prepare(sql: string): any;
}

// Local database instance
let localDb: Database.Database | null = null;

// Initialize local database
async function initLocalDatabase(): Promise<Database.Database> {
  if (localDb) return localDb;

  const dbPath = join(__dirname, '..', 'tradingdoge.db');

  localDb = new Database(dbPath);

  // Enable WAL mode for better performance
  localDb!.pragma('journal_mode = WAL');

  // Initialize tables
  initTables(localDb as any);

  return localDb;
}

// Initialize tables
function initTables(db: any) {
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

// Unified database wrapper interface
interface DbWrapper {
  isLocal: boolean;
  init(): Promise<void>;
  run(sql: string, params?: any[]): Promise<{ lastRowId?: number; changes?: number }>;
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any | undefined>;
}

// Local database wrapper for better-sqlite3
class LocalDbWrapper implements DbWrapper {
  isLocal = true;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async init(): Promise<void> {
    // Already initialized in constructor
  }

  async run(sql: string, params: any[] = []): Promise<{ lastRowId?: number; changes?: number }> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return { lastRowId: Number(info.lastInsertRowid), changes: info.changes };
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  async get(sql: string, params: any[] = []): Promise<any | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }
}

// Global database wrapper
let dbWrapper: DbWrapper | null = null;
let dbInitialized = false;

// Initialize database wrapper
export async function initDatabase(): Promise<void> {
  if (dbInitialized) return;

  // Local environment - use better-sqlite3
  const localDbInstance = await initLocalDatabase();
  dbWrapper = new LocalDbWrapper(localDbInstance);

  dbInitialized = true;
}

// Get the database wrapper
export function getDbWrapper(): DbWrapper | null {
  return dbWrapper;
}

// ============================================
// Database Operations (unified for local and D1)
// ============================================

// Insert or update stock data
export async function upsertStockData(symbol: string, interval: string, data: OHLCV[]): Promise<void> {
  await initDatabase();
  if (!dbWrapper) return;

  for (const item of data) {
    await dbWrapper.run(
      `INSERT INTO stock_data (symbol, interval, datetime, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol, interval, datetime) DO UPDATE SET
         open = excluded.open, high = excluded.high, low = excluded.low,
         close = excluded.close, volume = excluded.volume`,
      [symbol, interval, item.datetime, item.open, item.high, item.low, item.close, item.volume]
    );
  }

  // Save is automatic with better-sqlite3
}

// Get stock data
export async function getStockData(symbol: string, interval: string, limit?: number): Promise<OHLCV[]> {
  await initDatabase();
  if (!dbWrapper) return [];

  let query = 'SELECT datetime, open, high, low, close, volume FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const data = await dbWrapper.all(query, [symbol, interval]);
  // Reverse for chronological order
  return data.reverse();
}

// Get latest datetime for symbol+interval
export async function getLatestDatetime(symbol: string, interval: string): Promise<string | null> {
  await initDatabase();
  if (!dbWrapper) return null;

  const result = await dbWrapper.get(
    'SELECT datetime FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC LIMIT 1',
    [symbol, interval]
  );

  return result ? result.datetime : null;
}

// Insert signal
export async function insertSignal(signal: Omit<Signal, 'id'>): Promise<void> {
  await initDatabase();
  if (!dbWrapper) return;

  await dbWrapper.run(
    'INSERT INTO signals (symbol, interval, signal_type, datetime, price) VALUES (?, ?, ?, ?, ?)',
    [signal.symbol, signal.interval, signal.signal_type, signal.datetime, signal.price]
  );

  if (false) { // Removed: 
    saveLocalDatabase();
  }
}

// Get signals
export async function getSignals(symbol: string, days: number = 30): Promise<Signal[]> {
  await initDatabase();
  if (!dbWrapper) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString();

  return await dbWrapper.all(
    'SELECT * FROM signals WHERE symbol = ? AND datetime >= ? ORDER BY datetime DESC',
    [symbol, cutoffStr]
  );
}

// Check if signal exists
export async function signalExists(symbol: string, interval: string, signalType: 'B' | 'S', datetime: string): Promise<boolean> {
  await initDatabase();
  if (!dbWrapper) return false;

  const result = await dbWrapper.get(
    'SELECT 1 FROM signals WHERE symbol = ? AND interval = ? AND signal_type = ? AND datetime = ?',
    [symbol, interval, signalType, datetime]
  );

  return !!result;
}

// Clear all signals
export async function clearAllSignals(): Promise<void> {
  await initDatabase();
  if (!dbWrapper) return;

  await dbWrapper.run('DELETE FROM signals');

  if (false) { // Removed: 
    saveLocalDatabase();
  }
}

// Get latest signals summary
export async function getLatestSignals(): Promise<Record<string, Record<string, { signal_type: string; datetime: string }>>> {
  await initDatabase();
  if (!dbWrapper) return {};

  const intervals = ['1h', '2h', '4h', '1day'];
  const result: Record<string, Record<string, { signal_type: string; datetime: string }>> = {};

  for (const symbol of SYMBOLS) {
    result[symbol] = {};
    for (const interval of intervals) {
      const signal = await dbWrapper.get(
        'SELECT signal_type, datetime FROM signals WHERE symbol = ? AND interval = ? ORDER BY datetime DESC LIMIT 1',
        [symbol, interval]
      );

      if (signal) {
        result[symbol][interval] = { signal_type: signal.signal_type, datetime: signal.datetime };
      }
    }
  }

  return result;
}

// ============ Agent Functions ============

export async function registerAgent(name: string, apiKey: string): Promise<Agent> {
  await initDatabase();
  if (!dbWrapper) throw new Error('Database not initialized');

  const result = await dbWrapper.run(
    'INSERT INTO agents (name, api_key) VALUES (?, ?)',
    [name, apiKey]
  );

  if (false) { // Removed: 
    saveLocalDatabase();
  }

  return {
    id: result.lastRowId as number,
    name,
    api_key: apiKey,
    notify_enabled: 0,
    notify_type: 'none',
    webhook_url: null,
    created_at: new Date().toISOString()
  };
}

export async function getAgentByApiKey(apiKey: string): Promise<Agent | null> {
  await initDatabase();
  if (!dbWrapper) return null;

  const agent = await dbWrapper.get('SELECT * FROM agents WHERE api_key = ?', [apiKey]);
  return agent || null;
}

export async function getAgentById(id: number): Promise<Agent | null> {
  await initDatabase();
  if (!dbWrapper) return null;

  const agent = await dbWrapper.get('SELECT * FROM agents WHERE id = ?', [id]);
  return agent || null;
}

export async function getAgentList(): Promise<Agent[]> {
  await initDatabase();
  if (!dbWrapper) return [];

  return await dbWrapper.all('SELECT id, name, notify_enabled, notify_type, created_at FROM agents ORDER BY created_at DESC');
}

export async function updateAgentNotifyConfig(id: number, notifyEnabled: number, notifyType: string, webhookUrl: string): Promise<void> {
  await initDatabase();
  if (!dbWrapper) return;

  await dbWrapper.run(
    'UPDATE agents SET notify_enabled = ?, notify_type = ?, webhook_url = ? WHERE id = ?',
    [notifyEnabled, notifyType, webhookUrl, id]
  );

  if (false) { // Removed: 
    saveLocalDatabase();
  }
}

// ============ Comment Functions ============

export async function insertComment(agentId: number, symbol: string, content: string): Promise<Comment> {
  await initDatabase();
  if (!dbWrapper) throw new Error('Database not initialized');

  const result = await dbWrapper.run(
    'INSERT INTO comments (agent_id, symbol, content) VALUES (?, ?, ?)',
    [agentId, symbol, content]
  );

  if (false) { // Removed: 
    saveLocalDatabase();
  }

  return {
    id: result.lastRowId as number,
    agent_id: agentId,
    symbol,
    content,
    created_at: new Date().toISOString()
  };
}

export async function getCommentsBySymbol(symbol: string): Promise<Comment[]> {
  await initDatabase();
  if (!dbWrapper) return [];

  return await dbWrapper.all(
    'SELECT c.*, a.name as agent_name FROM comments c JOIN agents a ON c.agent_id = a.id WHERE c.symbol = ? ORDER BY c.created_at DESC',
    [symbol]
  );
}

export async function getCommentsByAgent(agentId: number): Promise<Comment[]> {
  await initDatabase();
  if (!dbWrapper) return [];

  return await dbWrapper.all(
    'SELECT * FROM comments WHERE agent_id = ? ORDER BY created_at DESC',
    [agentId]
  );
}

export async function toggleCommentLike(commentId: number, agentId: number): Promise<boolean> {
  await initDatabase();
  if (!dbWrapper) return false;

  const existing = await dbWrapper.get(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?',
    [commentId, agentId]
  );

  if (existing) {
    await dbWrapper.run('DELETE FROM comment_likes WHERE comment_id = ? AND agent_id = ?', [commentId, agentId]);
  } else {
    await dbWrapper.run('INSERT INTO comment_likes (comment_id, agent_id) VALUES (?, ?)', [commentId, agentId]);
  }

  if (false) { // Removed: 
    saveLocalDatabase();
  }

  return !existing;
}

export async function getCommentLikeCount(commentId: number): Promise<number> {
  await initDatabase();
  if (!dbWrapper) return 0;

  const result = await dbWrapper.get(
    'SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?',
    [commentId]
  );

  return result ? result.count : 0;
}

export async function getCommentLikeStatus(commentId: number, agentId: number): Promise<boolean> {
  await initDatabase();
  if (!dbWrapper) return false;

  const result = await dbWrapper.get(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?',
    [commentId, agentId]
  );

  return !!result;
}

// Export for testing
export default { initDatabase };