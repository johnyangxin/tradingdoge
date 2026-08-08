import express, { Request, Response, NextFunction } from 'express';
import { SYMBOLS, Interval } from './types';
import { getStockData, getSignals, initDatabase, clearAllSignals, registerAgent, getAgentByApiKey, getAgentById, getAgentList, updateAgentNotifyConfig, insertComment, getCommentsBySymbol, getCommentsByAgent, toggleCommentLike, getCommentLikeCount, getCommentLikeStatus, getLatestSignals, getLatestDatetime } from './database';
import { getCandlesWithMA, CandleWithMA } from './signals';
import { manualFetch, validateAndFetchIncomplete } from './scheduler';
import { notifyNewComment } from './notifier';
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

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const signals = await getSignals(symbol, days);
  const intervals = ['1h', '2h', '4h', '1day'];

  // Build date to signal mapping
  const signalMap: Record<string, Record<string, 'B' | 'S' | '-'>> = {};

  // Only populate dates with signals
  // signals are ordered DESC (most recent first); only set if not yet assigned
  for (const sig of signals) {
    const dateStr = sig.datetime.split(' ')[0].split('T')[0];
    if (intervals.includes(sig.interval)) {
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
  const days = parseInt(req.query.days as string) || 30;

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const signals = await getSignals(symbol, days);
  res.json({ symbol, days, signals });
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

export default router;