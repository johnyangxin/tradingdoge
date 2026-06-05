import express, { Request, Response, NextFunction } from 'express';
import { SYMBOLS, Interval } from './types';
import { getStockData, getSignals, initDatabase, clearAllSignals, registerAgent, getAgentByApiKey, getAgentById, getAgentList, updateAgentNotifyConfig, insertComment, getCommentsBySymbol, getCommentsByAgent, toggleCommentLike, getCommentLikeCount, getCommentLikeStatus, getLatestSignals } from './database';
import { getCandlesWithMA, CandleWithMA } from './signals';
import { manualFetch, validateAndFetchIncomplete } from './scheduler';
import { notifyNewComment, notifyUseralert } from './notifier';
import crypto from 'crypto';

const router = express.Router();

// Initialize database
initDatabase();

// Get stocks list
router.get('/stocks', (_req: Request, res: Response) => {
  const stocks = SYMBOLS.map(s => ({
    symbol: s,
    name: s === 'SPY' ? 'S&P 500 ETF' : s === 'BTC/USD' ? 'Bitcoin' : s === 'UVIX' ? 'Invesco NASDAQ 100 Low Volatility ETN' : s === 'GLD' ? 'SPDR Gold Shares' : s
  }));
  res.json(stocks);
});

// Get stock data with moving averages
router.get('/stock/:symbol', async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  // Frontend uses BTC-USD, backend uses BTC/USD
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const interval = (req.query.interval as string) || '1day';

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  if (!['1h', '2h', '4h', '1day', '1week', '1month'].includes(interval)) {
    return res.status(400).json({ error: 'Invalid interval' });
  }

  // Get candles with moving averages
  const data = await getCandlesWithMA(symbol, interval);
  res.json({ symbol, interval, data });
});

// Get daily signals summary
router.get('/signals-daily/:symbol', async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const days = 10;
  const intervals = ['1h', '2h', '4h', '1day'];

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  // Fetch signals for all intervals in parallel
  const allSignals = await Promise.all(
    intervals.map(int => getSignals(symbol, int, days))
  );

  // Build date to signal mapping
  const signalMap: Record<string, Record<string, 'B' | 'S' | '-'>> = {};

  // Process all signals
  for (const signals of allSignals) {
    for (const sig of signals) {
      const dateStr = sig.datetime.split(' ')[0].split('T')[0];
      if (!signalMap[dateStr]) {
        signalMap[dateStr] = { '1h': '-', '2h': '-', '4h': '-', '1day': '-' };
      }
      if (signalMap[dateStr][sig.interval] === '-') {
        signalMap[dateStr][sig.interval] = sig.signal_type as 'B' | 'S';
      }
    }
  }

  // Convert to array, sorted by date
  const result = Object.entries(signalMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, days)
    .map(([date, sigs]) => ({ date, ...sigs }));

  res.json({ symbol, days, data: result });
});

// Get B/S signals
router.get('/signals/:symbol', async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const interval = (req.query.interval as string) || '1h';
  const days = parseInt(req.query.days as string) || 30;

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const signals = await getSignals(symbol, interval, days);
  res.json({ symbol, interval, days, signals });
});

// Manually trigger data fetch
router.post('/fetch', async (_req: Request, res: Response) => {
  try {
    await manualFetch();
    res.json({ success: true, message: 'Data fetch initiated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear and regenerate signals
router.post('/reset-signals', async (_req: Request, res: Response) => {
  await clearAllSignals();
  await manualFetch();
  res.json({ success: true, message: 'Signals cleared and regenerated' });
});

// Validate and fetch incomplete data
router.post('/validate', async (_req: Request, res: Response) => {
  try {
    const results = await validateAndFetchIncomplete();
    const incomplete = results.filter(r => r.status !== 'complete');
    res.json({
      success: true,
      total: results.length,
      complete: results.filter(r => r.status === 'complete').length,
      updated: incomplete.length,
      results
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get latest datetime for a symbol
router.get('/latest/:symbol', async (req: Request, res: Response) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const latestDatetime = await getLatestDatetime(symbol, '1day');
  res.json({ symbol, latest_datetime: latestDatetime });
});

// Get signals summary
router.get('/signals-summary', async (_req: Request, res: Response) => {
  const summary = await getLatestSignals();
  res.json({ summary });
});

// ============ Agent API ============

// Agent authentication middleware
async function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'API Key required' });
  }

  const agent = await getAgentByApiKey(apiKey);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  (req as any).agent = agent;
  next();
}

// Register Agent
router.post('/agents/register', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Agent name required' });
  }

  // Generate random API Key
  const apiKey = crypto.randomBytes(16).toString('hex');

  try {
    const agent = await registerAgent(name, apiKey);
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: agent.api_key
      }
    });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Agent name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get Agent list
router.get('/agents/list', async (_req: Request, res: Response) => {
  const agents = await getAgentList();
  res.json({ agents });
});

// Get current logged in Agent info
router.get('/agents/me', authenticateAgent, (req: Request, res: Response) => {
  const agent = (req as any).agent;
  res.json({ agent: { id: agent.id, name: agent.name, notify_enabled: agent.notify_enabled, notify_type: agent.notify_type } });
});

// Configure notifications
router.post('/agents/notify-config', authenticateAgent, async (req: Request, res: Response) => {
  const agent = (req as any).agent;
  const { notify_type, webhook_url } = req.body;

  if (!['none'].includes(notify_type)) {
    return res.status(400).json({ error: 'Invalid notify_type' });
  }

  await updateAgentNotifyConfig(agent.id, notify_type === 'none' ? 0 : 1, notify_type, webhook_url || '');
  res.json({ success: true });
});

// ============ Comments API ============

// Get stock comments
router.get('/comments/:symbol', async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');

  const comments = await getCommentsBySymbol(symbol);
  const currentAgent = (req as any).agent;

  // Add like count and personal like status
  const commentsWithLikes = await Promise.all(comments.map(async c => ({
    ...c,
    like_count: await getCommentLikeCount(c.id),
    liked: currentAgent ? await getCommentLikeStatus(c.id, currentAgent.id) : false
  })));

  res.json({ comments: commentsWithLikes });
});

// Post comment
router.post('/comments/:symbol', authenticateAgent, async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');

  const { content } = req.body;
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content required' });
  }

  const agent = (req as any).agent;
  const comment = await insertComment(agent.id, symbol, content);

  // Send notification
  await notifyNewComment(comment);

  res.json({ success: true, comment });
});

// Get all comments for an Agent
router.get('/comments/agent/:agentId', authenticateAgent, async (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const comments = await getCommentsByAgent(agentId);
  res.json({ comments });
});

// Like/unlike comment
router.post('/comments/:id/like', authenticateAgent, async (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  const agent = (req as any).agent;

  const liked = await toggleCommentLike(commentId, agent.id);
  const likeCount = await getCommentLikeCount(commentId);

  res.json({ success: true, liked, like_count: likeCount });
});

// ============ Auth Routes ============
import { sendVerificationCode, registerWithCode, login, verifyToken } from './auth';
import { getUserById, getUserFavorites, addUserFavorite, removeUserFavorite, getUserAlerts, hasAlertToday, getAllUsersWithFavorites } from './database';

// Send verification code
router.post('/auth/send-code', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Valid email required' });
  }

  const result = await sendVerificationCode(email);
  res.json(result);
});

// Register
router.post('/auth/register', async (req: Request, res: Response) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ message: 'Email, code, and password required' });
  }

  const result = await registerWithCode(email, code, password);
  res.json(result);
});

// Login
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  const result = await login(email, password);
  res.json(result);
});

// Auth middleware
function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization required' });
  }

  const token = authHeader.slice(7);
  const userPayload = verifyToken(token);

  if (!userPayload) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  (req as any).user = userPayload;
  next();
}

// Get current user
router.get('/auth/me', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const user = await getUserById(userPayload.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({ id: user.id, email: user.email, username: user.username });
});

// Get user favorites
router.get('/user/favorites', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const favorites = await getUserFavorites(userPayload.id);

  res.json({ favorites });
});

// Add favorite
router.post('/user/favorites', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ message: 'Symbol required' });
  }

  await addUserFavorite(userPayload.id, symbol);
  res.json({ success: true });
});

// Remove favorite
router.delete('/user/favorites/:symbol', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const symbol = decodeURIComponent(req.params.symbol);

  await removeUserFavorite(userPayload.id, symbol);
  res.json({ success: true });
});

// Get user alerts
router.get('/user/alerts', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const alerts = await getUserAlerts(userPayload.id);
  res.json({ alerts });
});

// Check alerts for user's favorites (manual trigger)
router.post('/user/check-alerts', authenticateUser, async (req: Request, res: Response) => {
  const userPayload = (req as any).user;
  const userId = userPayload.id;

  // 获取用户收藏的股票
  const favorites = await getUserFavorites(userId);

  if (favorites.length === 0) {
    res.json({ success: true, alertsAdded: 0 });
    return;
  }

  // 检查每只股票是否全 B 或全 S
  let alertsAdded = 0;
  for (const symbol of favorites) {
    const signalType = await checkAllBSignal(symbol);
    if (!signalType) continue;

    // 检查今天是否已经发送过同类提醒
    const hasAlert = await hasAlertToday(userId, symbol, signalType);
    if (hasAlert) continue;

    // 获取当前价格
    const data = await getStockData(symbol, '1day', 1);
    const price = data.length > 0 ? data[data.length - 1].close : 0;

    // 发送通知并保存记录
    await notifyUseralert(userId, symbol, signalType, price);
    alertsAdded++;
  }

  res.json({ success: true, alertsAdded });
});

// 检查单只股票是否全 B 或全 S，返回信号类型或 null
async function checkAllBSignal(symbol: string): Promise<'B' | 'S' | null> {
  const intervals = ['1h', '2h', '4h', '1day'];
  const latestSignals: string[] = [];

  for (const interval of intervals) {
    const signals = await getSignals(symbol, interval, 3);
    if (signals.length > 0) {
      latestSignals.push(signals[0].signal_type);
    }
  }

  if (latestSignals.length < 4) return null;

  const allB = latestSignals.every(s => s === 'B');
  const allS = latestSignals.every(s => s === 'S');

  if (allB) return 'B';
  if (allS) return 'S';
  return null;
}

export default router;