export interface OHLCV {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  symbol: string;
  interval: string;
  data: OHLCV[];
}

export interface Signal {
  id?: number;
  symbol: string;
  interval: string;
  signal_type: 'B' | 'S';
  datetime: string;
  price: number;
}

export interface Stock {
  symbol: string;
  name: string;
}

export const INTERVALS = ['1h', '2h', '4h', '1day', '1week', '1month'] as const;
export type Interval = typeof INTERVALS[number];

export const SYMBOLS = ['SPY', 'BTC/USD', 'UVIX', 'GLD', 'MSTR', 'SNDK', 'SPCX', 'SOXL', 'MU', 'SKHY', 'SOXX', 'INTC', 'MRVL', 'NVDA', 'TSLA', 'GOOG', 'AMD', 'COIN', 'META', 'AAPL', 'MSFT', 'ORCL', 'AMZN', 'HOOD'] as const;
export type Symbol = typeof SYMBOLS[number];

// ============ Agent & Comment Types ============

export interface Agent {
  id: number;
  name: string;
  api_key?: string;
  notify_enabled: number;
  notify_type: string;
  webhook_url: string | null;
  created_at: string;
}

export interface Comment {
  id: number;
  agent_id: number;
  symbol: string;
  content: string;
  created_at: string;
  agent_name?: string;
  like_count?: number;
  liked?: boolean;
}