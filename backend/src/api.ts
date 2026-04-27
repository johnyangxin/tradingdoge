import express, { Request, Response } from 'express';
import { SYMBOLS, Interval } from './types';
import { getStockData, getSignals, initDatabase, clearAllSignals, registerAgent, getAgentByApiKey, getAgentById, getAgentList, updateAgentNotifyConfig, insertComment, getCommentsBySymbol, getCommentsByAgent, toggleCommentLike, getCommentLikeCount, getCommentLikeStatus, getLatestSignals } from './database';
import { getCandlesWithMA, CandleWithMA } from './signals';
import { manualFetch } from './scheduler';
import { notifyNewComment } from './notifier';
import crypto from 'crypto';

const router = express.Router();

// 初始化路由时确保数据库已初始化
initDatabase();

// 获取股票列表
router.get('/stocks', (_req: Request, res: Response) => {
  const stocks = SYMBOLS.map(s => ({
    symbol: s,
    name: s === 'SPY' ? 'S&P 500 ETF' : s === 'BTC/USD' ? 'Bitcoin' : s === 'UVIX' ? 'Invesco NASDAQ 100 Low Volatility ETN' : s === 'GLD' ? 'SPDR Gold Shares' : s
  }));
  res.json(stocks);
});

// 获取股票数据（带均线）
router.get('/stock/:symbol', (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  // 前端用 BTC-USD，后端用 BTC/USD
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const interval = (req.query.interval as string) || '1day';

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  if (!['1h', '2h', '4h', '1day', '1week', '1month'].includes(interval)) {
    return res.status(400).json({ error: 'Invalid interval' });
  }

  // 获取带均线的K线数据
  const data = getCandlesWithMA(symbol, interval);
  res.json({ symbol, interval, data });
});

// 获取B/S信号
router.get('/signals/:symbol', (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  // 前端用 BTC-USD，后端用 BTC/USD
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const days = parseInt(req.query.days as string) || 30;

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const signals = getSignals(symbol, days);
  res.json({ symbol, days, signals });
});

// 获取每日信号汇总
router.get('/signals-daily/:symbol', (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');
  const days = 10;

  if (!SYMBOLS.includes(symbol as any)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const signals = getSignals(symbol, days);
  const intervals = ['1h', '2h', '4h', '1day'];

  // 构建日期到信号的映射
  const signalMap: Record<string, Record<string, 'B' | 'S' | '-'>> = {};

  // 只填充有信号的日期
  for (const sig of signals) {
    const dateStr = sig.datetime.split(' ')[0].split('T')[0];
    if (intervals.includes(sig.interval)) {
      if (!signalMap[dateStr]) {
        signalMap[dateStr] = { '1h': '-', '2h': '-', '4h': '-', '1day': '-' };
      }
      signalMap[dateStr][sig.interval] = sig.signal_type;
    }
  }

  // 转换为数组，按日期排序，只返回最近的days个交易日
  const result = Object.entries(signalMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, days)
    .map(([date, sigs]) => ({ date, ...sigs }));

  res.json({ symbol, days, data: result });
});

// 手动触发数据更新
router.post('/fetch', async (_req: Request, res: Response) => {
  try {
    await manualFetch();
    res.json({ success: true, message: 'Data fetch initiated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 清除并重新生成信号
router.post('/reset-signals', async (_req: Request, res: Response) => {
  clearAllSignals();
  await manualFetch();
  res.json({ success: true, message: 'Signals cleared and regenerated' });
});

// 获取信号汇总
router.get('/signals-summary', (_req: Request, res: Response) => {
  const summary = getLatestSignals();
  res.json({ summary });
});

// ============ Agent API ============

// Agent认证中间件
function authenticateAgent(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'API Key required' });
  }

  const agent = getAgentByApiKey(apiKey);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  (req as any).agent = agent;
  next();
}

// 注册Agent
router.post('/agents/register', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Agent name required' });
  }

  // 生成随机API Key
  const apiKey = crypto.randomBytes(16).toString('hex');

  try {
    const agent = registerAgent(name, apiKey);
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: agent.api_key
      }
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Agent name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// 获取Agent列表
router.get('/agents/list', (_req: Request, res: Response) => {
  const agents = getAgentList();
  res.json({ agents });
});

// 获取当前登录Agent信息
router.get('/agents/me', authenticateAgent, (req: Request, res: Response) => {
  const agent = (req as any).agent;
  res.json({ agent: { id: agent.id, name: agent.name, notify_enabled: agent.notify_enabled, notify_type: agent.notify_type } });
});

// 配置通知
router.post('/agents/notify-config', authenticateAgent, (req: Request, res: Response) => {
  const agent = (req as any).agent;
  const { notify_type, webhook_url } = req.body;

  if (!['none'].includes(notify_type)) {
    return res.status(400).json({ error: 'Invalid notify_type' });
  }

  updateAgentNotifyConfig(agent.id, notify_type === 'none' ? 0 : 1, notify_type, webhook_url || '');
  res.json({ success: true });
});

// ============ Comments API ============

// 获取股票评论
router.get('/comments/:symbol', (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');

  const comments = getCommentsBySymbol(symbol);
  const currentAgent = (req as any).agent;

  // 添加点赞数和个人点赞状态
  const commentsWithLikes = comments.map(c => ({
    ...c,
    like_count: getCommentLikeCount(c.id),
    liked: currentAgent ? getCommentLikeStatus(c.id, currentAgent.id) : false
  }));

  res.json({ comments: commentsWithLikes });
});

// 发表评论
router.post('/comments/:symbol', authenticateAgent, async (req: Request, res: Response) => {
  let symbol = decodeURIComponent(req.params.symbol);
  symbol = symbol.replace('BTC-USD', 'BTC/USD');

  const { content } = req.body;
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content required' });
  }

  const agent = (req as any).agent;
  const comment = insertComment(agent.id, symbol, content);

  // 发送通知
  await notifyNewComment(comment);

  res.json({ success: true, comment });
});

// 获取Agent的所有评论
router.get('/comments/agent/:agentId', authenticateAgent, (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const comments = getCommentsByAgent(agentId);
  res.json({ comments });
});

// 点赞/取消点赞评论
router.post('/comments/:id/like', authenticateAgent, (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  const agent = (req as any).agent;

  const liked = toggleCommentLike(commentId, agent.id);
  const likeCount = getCommentLikeCount(commentId);

  res.json({ success: true, liked, like_count: likeCount });
});

export default router;