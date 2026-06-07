"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.getDbWrapper = getDbWrapper;
exports.upsertStockData = upsertStockData;
exports.getStockData = getStockData;
exports.getLatestDatetime = getLatestDatetime;
exports.getAllDates = getAllDates;
exports.insertSignal = insertSignal;
exports.getSignals = getSignals;
exports.signalExists = signalExists;
exports.clearAllSignals = clearAllSignals;
exports.getLatestSignals = getLatestSignals;
exports.registerAgent = registerAgent;
exports.getAgentByApiKey = getAgentByApiKey;
exports.getAgentById = getAgentById;
exports.getAgentList = getAgentList;
exports.updateAgentNotifyConfig = updateAgentNotifyConfig;
exports.insertComment = insertComment;
exports.getCommentsBySymbol = getCommentsBySymbol;
exports.getCommentsByAgent = getCommentsByAgent;
exports.toggleCommentLike = toggleCommentLike;
exports.getCommentLikeCount = getCommentLikeCount;
exports.getCommentLikeStatus = getCommentLikeStatus;
const types_1 = require("./types");
const client_1 = require("@libsql/client");
// Turso configuration
const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://tradingdoge-johnyang.aws-us-east-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
// Get D1 database from env
function getD1Db() {
    const env = globalThis.env;
    return env?.DB || null;
}
// Local database instance
let localDb = null;
// Initialize local database (Node.js only)
async function initLocalDatabase() {
    if (localDb)
        return localDb;
    const Database = (await Promise.resolve().then(() => __importStar(require('better-sqlite3')))).default;
    const { fileURLToPath } = await Promise.resolve().then(() => __importStar(require('url')));
    const { dirname, join } = await Promise.resolve().then(() => __importStar(require('path')));
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const dbPath = join(__dirname, '..', 'tradingdoge.db');
    localDb = new Database(dbPath);
    localDb.pragma('journal_mode = WAL');
    // Initialize tables
    initTables(localDb);
    return localDb;
}
// Initialize tables
function initTables(db) {
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
      price REAL NOT NULL,
      UNIQUE(symbol, interval, datetime)
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
// Local database wrapper for better-sqlite3
class LocalDbWrapper {
    constructor(db) {
        this.isLocal = true;
        this.db = db;
    }
    async init() {
        // Already initialized in constructor
    }
    async run(sql, params = []) {
        const stmt = this.db.prepare(sql);
        const info = stmt.run(...params);
        return { lastRowId: Number(info.lastInsertRowid), changes: info.changes };
    }
    async all(sql, params = []) {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }
    async get(sql, params = []) {
        const stmt = this.db.prepare(sql);
        return stmt.get(...params);
    }
}
// D1 database wrapper for Cloudflare Workers
class D1DbWrapper {
    constructor(db) {
        this.isLocal = false;
        this.db = db;
    }
    async init() {
        // D1 tables are created via wrangler, no need to init here
    }
    async run(sql, params = []) {
        const result = await this.db.prepare(sql).bind(...params).run();
        return { lastRowId: result.meta?.last_row_id, changes: result.meta?.changes };
    }
    async all(sql, params = []) {
        const result = await this.db.prepare(sql).bind(...params).all();
        return result.results || [];
    }
    async get(sql, params = []) {
        const result = await this.db.prepare(sql).bind(...params).first();
        return result || undefined;
    }
}
// Turso database wrapper
class TursoDbWrapper {
    constructor(client) {
        this.isLocal = false;
        this.client = client;
    }
    async init() {
        // Create tables if not exists
        const createTableSql = `
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
        price REAL NOT NULL,
        UNIQUE(symbol, interval, datetime)
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
    `;
        await this.client.execute(createTableSql);
    }
    async run(sql, params = []) {
        const result = await this.client.execute({ sql, args: params });
        return { lastRowId: result.lastInsertRowid, changes: result.rowsAffected };
    }
    async all(sql, params = []) {
        const result = await this.client.execute({ sql, args: params });
        return result.rows;
    }
    async get(sql, params = []) {
        const result = await this.client.execute({ sql, args: params });
        return result.rows[0] || undefined;
    }
}
// Global database wrapper
let dbWrapper = null;
let dbInitialized = false;
// Initialize database wrapper
async function initDatabase() {
    if (dbInitialized)
        return;
    // Check if running in Cloudflare Workers (has D1 DB)
    const d1Db = getD1Db();
    if (d1Db) {
        // Use D1 database for Workers
        dbWrapper = new D1DbWrapper(d1Db);
        await dbWrapper.init();
    }
    else if (TURSO_URL && TURSO_AUTH_TOKEN) {
        // Use Turso database for Vercel
        const client = (0, client_1.createClient)({
            url: TURSO_URL,
            authToken: TURSO_AUTH_TOKEN
        });
        dbWrapper = new TursoDbWrapper(client);
        await dbWrapper.init();
    }
    else {
        // Local environment - use better-sqlite3
        const localDbInstance = await initLocalDatabase();
        dbWrapper = new LocalDbWrapper(localDbInstance);
    }
    dbInitialized = true;
}
// Get the database wrapper
function getDbWrapper() {
    return dbWrapper;
}
// ============================================
// Database Operations (unified for local and D1)
// ============================================
// Insert or update stock data
async function upsertStockData(symbol, interval, data) {
    await initDatabase();
    if (!dbWrapper)
        return;
    for (const item of data) {
        await dbWrapper.run(`INSERT INTO stock_data (symbol, interval, datetime, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol, interval, datetime) DO UPDATE SET
         open = excluded.open, high = excluded.high, low = excluded.low,
         close = excluded.close, volume = excluded.volume`, [symbol, interval, item.datetime, item.open, item.high, item.low, item.close, item.volume]);
    }
    // Save is automatic with better-sqlite3
}
// Get stock data
async function getStockData(symbol, interval, limit) {
    await initDatabase();
    if (!dbWrapper)
        return [];
    let query = 'SELECT datetime, open, high, low, close, volume FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC';
    if (limit) {
        query += ` LIMIT ${limit}`;
    }
    const data = await dbWrapper.all(query, [symbol, interval]);
    // Reverse for chronological order
    return data.reverse();
}
// Get latest datetime for symbol+interval
async function getLatestDatetime(symbol, interval) {
    await initDatabase();
    if (!dbWrapper)
        return null;
    const result = await dbWrapper.get('SELECT datetime FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime DESC LIMIT 1', [symbol, interval]);
    return result ? result.datetime : null;
}
// Get all dates for a symbol+interval
async function getAllDates(symbol, interval) {
    await initDatabase();
    if (!dbWrapper)
        return [];
    return await dbWrapper.all('SELECT DISTINCT datetime FROM stock_data WHERE symbol = ? AND interval = ? ORDER BY datetime', [symbol, interval]);
}
// Insert signal
async function insertSignal(signal) {
    await initDatabase();
    if (!dbWrapper)
        return;
    await dbWrapper.run(`INSERT INTO signals (symbol, interval, signal_type, datetime, price) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(symbol, interval, datetime) DO UPDATE SET signal_type = excluded.signal_type, price = excluded.price`, [signal.symbol, signal.interval, signal.signal_type, signal.datetime, signal.price]);
    if (false) {
        // This block is intentionally empty - saveLocalDatabase was removed
    }
}
// Get signals
async function getSignals(symbol, days = 30) {
    await initDatabase();
    if (!dbWrapper)
        return [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    // Use date-only string to avoid format mismatch: stored datetimes use space separator
    // e.g. "2026-05-11 14:00:00" vs ISO "2026-05-11T..." — space < T in ASCII
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    return await dbWrapper.all('SELECT * FROM signals WHERE symbol = ? AND datetime >= ? ORDER BY datetime DESC', [symbol, cutoffStr]);
}
// Check if signal exists
async function signalExists(symbol, interval, signalType, datetime) {
    await initDatabase();
    if (!dbWrapper)
        return false;
    const result = await dbWrapper.get('SELECT 1 FROM signals WHERE symbol = ? AND interval = ? AND signal_type = ? AND datetime = ?', [symbol, interval, signalType, datetime]);
    return !!result;
}
// Clear all signals
async function clearAllSignals() {
    await initDatabase();
    if (!dbWrapper)
        return;
    await dbWrapper.run('DELETE FROM signals');
    if (false) {
        // This block is intentionally empty - saveLocalDatabase was removed
    }
}
// Get latest signals summary
async function getLatestSignals() {
    await initDatabase();
    if (!dbWrapper)
        return {};
    const intervals = ['1h', '2h', '4h', '1day'];
    const result = {};
    for (const symbol of types_1.SYMBOLS) {
        result[symbol] = {};
        for (const interval of intervals) {
            const signal = await dbWrapper.get('SELECT signal_type, datetime FROM signals WHERE symbol = ? AND interval = ? ORDER BY datetime DESC LIMIT 1', [symbol, interval]);
            if (signal) {
                result[symbol][interval] = { signal_type: signal.signal_type, datetime: signal.datetime };
            }
        }
    }
    return result;
}
// ============ Agent Functions ============
async function registerAgent(name, apiKey) {
    await initDatabase();
    if (!dbWrapper)
        throw new Error('Database not initialized');
    const result = await dbWrapper.run('INSERT INTO agents (name, api_key) VALUES (?, ?)', [name, apiKey]);
    if (false) {
        // placeholder
    }
    return {
        id: result.lastRowId,
        name,
        api_key: apiKey,
        notify_enabled: 0,
        notify_type: 'none',
        webhook_url: null,
        created_at: new Date().toISOString()
    };
}
async function getAgentByApiKey(apiKey) {
    await initDatabase();
    if (!dbWrapper)
        return null;
    const agent = await dbWrapper.get('SELECT * FROM agents WHERE api_key = ?', [apiKey]);
    return agent || null;
}
async function getAgentById(id) {
    await initDatabase();
    if (!dbWrapper)
        return null;
    const agent = await dbWrapper.get('SELECT * FROM agents WHERE id = ?', [id]);
    return agent || null;
}
async function getAgentList() {
    await initDatabase();
    if (!dbWrapper)
        return [];
    return await dbWrapper.all('SELECT id, name, notify_enabled, notify_type, created_at FROM agents ORDER BY created_at DESC');
}
async function updateAgentNotifyConfig(id, notifyEnabled, notifyType, webhookUrl) {
    await initDatabase();
    if (!dbWrapper)
        return;
    await dbWrapper.run('UPDATE agents SET notify_enabled = ?, notify_type = ?, webhook_url = ? WHERE id = ?', [notifyEnabled, notifyType, webhookUrl, id]);
    if (false) {
        // This block is intentionally empty - saveLocalDatabase was removed
    }
}
// ============ Comment Functions ============
async function insertComment(agentId, symbol, content) {
    await initDatabase();
    if (!dbWrapper)
        throw new Error('Database not initialized');
    const result = await dbWrapper.run('INSERT INTO comments (agent_id, symbol, content) VALUES (?, ?, ?)', [agentId, symbol, content]);
    if (false) {
        // placeholder
    }
    return {
        id: result.lastRowId,
        agent_id: agentId,
        symbol,
        content,
        created_at: new Date().toISOString()
    };
}
async function getCommentsBySymbol(symbol) {
    await initDatabase();
    if (!dbWrapper)
        return [];
    return await dbWrapper.all('SELECT c.*, a.name as agent_name FROM comments c JOIN agents a ON c.agent_id = a.id WHERE c.symbol = ? ORDER BY c.created_at DESC', [symbol]);
}
async function getCommentsByAgent(agentId) {
    await initDatabase();
    if (!dbWrapper)
        return [];
    return await dbWrapper.all('SELECT * FROM comments WHERE agent_id = ? ORDER BY created_at DESC', [agentId]);
}
async function toggleCommentLike(commentId, agentId) {
    await initDatabase();
    if (!dbWrapper)
        return false;
    const existing = await dbWrapper.get('SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?', [commentId, agentId]);
    if (existing) {
        await dbWrapper.run('DELETE FROM comment_likes WHERE comment_id = ? AND agent_id = ?', [commentId, agentId]);
    }
    else {
        await dbWrapper.run('INSERT INTO comment_likes (comment_id, agent_id) VALUES (?, ?)', [commentId, agentId]);
    }
    if (false) {
        // placeholder
    }
    return !existing;
}
async function getCommentLikeCount(commentId) {
    await initDatabase();
    if (!dbWrapper)
        return 0;
    const result = await dbWrapper.get('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?', [commentId]);
    return result ? result.count : 0;
}
async function getCommentLikeStatus(commentId, agentId) {
    await initDatabase();
    if (!dbWrapper)
        return false;
    const result = await dbWrapper.get('SELECT 1 FROM comment_likes WHERE comment_id = ? AND agent_id = ?', [commentId, agentId]);
    return !!result;
}
// Export for testing
exports.default = { initDatabase };
