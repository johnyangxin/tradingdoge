export interface OHLCV {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma25: number | null;
  ma90: number | null;
}

export interface Stock {
  symbol: string;
  name: string;
}

export interface Signal {
  id: number;
  symbol: string;
  interval: string;
  signal_type: 'B' | 'S';
  datetime: string;
  price: number;
}

export const INTERVALS = ['1h', '2h', '4h', '1day', '1week', '1month'] as const;
export type Interval = typeof INTERVALS[number];

// Use environment variable for API base, default to /api for local development
// For Cloudflare Pages, set PUBLIC_API_URL to your Workers URL
export const API_BASE = import.meta.env.PUBLIC_API_URL || '/api';

export async function fetchStocks(): Promise<Stock[]> {
  const res = await fetch(`${API_BASE}/stocks`);
  return res.json();
}

export async function fetchStockData(symbol: string, interval: string = '1day'): Promise<{ symbol: string; interval: string; data: OHLCV[] }> {
  const res = await fetch(`${API_BASE}/stock/${symbol}?interval=${interval}`);
  return res.json();
}

export async function fetchSignals(symbol: string, interval: string = '1h', days: number = 30): Promise<{ symbol: string; days: number; signals: Signal[] }> {
  const res = await fetch(`${API_BASE}/signals/${symbol}?interval=${interval}&days=${days}`);
  return res.json();
}

export interface DailySignal {
  date: string;
  '1h': 'B' | 'S' | '-';
  '2h': 'B' | 'S' | '-';
  '4h': 'B' | 'S' | '-';
  '1day': 'B' | 'S' | '-';
}

export async function fetchDailySignals(symbol: string): Promise<{ symbol: string; days: number; data: DailySignal[] }> {
  const res = await fetch(`${API_BASE}/signals-daily/${symbol}`);
  return res.json();
}

// Signals summary types
export interface SignalData {
  signal_type: string;
  datetime: string;
}

export interface SignalsSummary {
  summary: Record<string, Record<string, SignalData>>;
}

export async function fetchSignalsSummary(): Promise<SignalsSummary> {
  const res = await fetch(`${API_BASE}/signals-summary`);
  return res.json();
}

// ============ Favorites API ============

export async function fetchFavorites(apiKey?: string): Promise<{ favorites: { symbol: string }[] }> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/user/favorites`, { headers });
  return res.json();
}

export async function addFavorite(symbol: string, apiKey?: string): Promise<{ success: boolean }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/user/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ symbol })
  });
  return res.json();
}

export async function removeFavorite(symbol: string, apiKey?: string): Promise<{ success: boolean }> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/user/favorites/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
    headers
  });
  return res.json();
}

export interface Alert {
  id: number;
  symbol: string;
  alert_type: string;
  price: number;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  atr: number | null;
  created_at: string;
}

export async function getAlerts(apiKey?: string): Promise<{ alerts: Alert[] }> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/user/alerts`, { headers });
  return res.json();
}

export async function checkAlerts(apiKey?: string): Promise<{ success: boolean; alertsAdded: number }> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/user/check-alerts`, {
    method: 'POST',
    headers
  });
  return res.json();
}

// ============ Agent & Comment Types ============

export interface Agent {
  id: number;
  name: string;
  notify_enabled: number;
  notify_type: string;
  created_at: string;
}

export interface Comment {
  id: number;
  agent_id: number;
  symbol: string;
  content: string;
  created_at: string;
  agent_name: string;
  like_count: number;
  liked: boolean;
}

// Agent API

export async function registerAgent(name: string): Promise<{ success: boolean; agent: { id: number; name: string; api_key: string } }> {
  const res = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function fetchAgentList(): Promise<{ agents: Agent[] }> {
  const res = await fetch(`${API_BASE}/agents/list`);
  return res.json();
}

export async function fetchCurrentAgent(apiKey: string): Promise<{ agent: Agent }> {
  const res = await fetch(`${API_BASE}/agents/me`, {
    headers: { 'X-API-Key': apiKey }
  });
  return res.json();
}

export async function updateNotifyConfig(apiKey: string, notifyType: string, webhookUrl: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/agents/notify-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ notify_type: notifyType, webhook_url: webhookUrl })
  });
  return res.json();
}

// Comment API

export async function fetchComments(symbol: string, apiKey?: string): Promise<{ comments: Comment[] }> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  const res = await fetch(`${API_BASE}/comments/${symbol}`, { headers });
  return res.json();
}

export async function postComment(symbol: string, content: string, apiKey: string): Promise<{ success: boolean; comment: Comment }> {
  const res = await fetch(`${API_BASE}/comments/${symbol}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ content })
  });
  return res.json();
}

export async function likeComment(commentId: number, apiKey: string): Promise<{ success: boolean; liked: boolean; like_count: number }> {
  const res = await fetch(`${API_BASE}/comments/${commentId}/like`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey }
  });
  return res.json();
}

export async function fetchAgentComments(agentId: number, apiKey: string): Promise<{ comments: Comment[] }> {
  const res = await fetch(`${API_BASE}/comments/agent/${agentId}`, {
    headers: { 'X-API-Key': apiKey }
  });
  return res.json();
}