import { SYMBOLS, INTERVALS, Interval } from './types';
import { upsertStockData, getLatestDatetime, initDatabase } from './database';
import { fetchTimeSeries } from './twelvedata';
import { processStockData } from './signals';

export interface Env {
  DB: D1Database;
  TWELVEDATA_API_KEY: string;
}

// Cloudflare Workers handler - 只读 API（定时抓取已移至 Vercel）
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set env for database wrapper
    (globalThis as any).env = env;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Only handle /api/* paths, pass through others
    if (!path.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }

    try {
      // Initialize database
      await initDatabase();

      // Route handling
      if (path === '/api/stocks' && method === 'GET') {
        const stocks = SYMBOLS.map(s => ({
          symbol: s,
          name: s === 'SPY' ? 'S&P 500 ETF' : s === 'BTC/USD' ? 'Bitcoin' : s === 'UVIX' ? 'Invesco NASDAQ 100 Low Volatility ETN' : s === 'GLD' ? 'SPDR Gold Shares' : s
        }));
        return jsonResponse(stocks);
      }

      const stockMatch = path.match(/^\/api\/stock\/([^/]+)$/);
      if (stockMatch && method === 'GET') {
        let symbol = decodeURIComponent(stockMatch[1]).replace('BTC-USD', 'BTC/USD');
        const interval = url.searchParams.get('interval') || '1day';
        const { getCandlesWithMA } = await import('./signals');
        const data = await getCandlesWithMA(symbol, interval);
        return jsonResponse({ symbol, interval, data });
      }

      const signalsMatch = path.match(/^\/api\/signals\/([^/]+)$/);
      if (signalsMatch && method === 'GET') {
        let symbol = decodeURIComponent(signalsMatch[1]).replace('BTC-USD', 'BTC/USD');
        const interval = url.searchParams.get('interval') || '1h';
        const days = parseInt(url.searchParams.get('days') || '30');
        const { getSignals } = await import('./database');
        const signals = await getSignals(symbol, interval, days);
        return jsonResponse({ symbol, interval, days, signals });
      }

      const signalsDailyMatch = path.match(/^\/api\/signals-daily\/([^/]+)$/);
      if (signalsDailyMatch && method === 'GET') {
        let symbol = decodeURIComponent(signalsDailyMatch[1]).replace('BTC-USD', 'BTC/USD');
        const days = 10;
        const { getSignals } = await import('./database');
        const signals = await getSignals(symbol, '1h', days);
        const intervals = ['1h', '2h', '4h', '1day'];

        const signalMap: Record<string, Record<string, 'B' | 'S' | '-'>> = {};
        for (const sig of signals) {
          const dateStr = sig.datetime.split(' ')[0].split('T')[0];
          if (intervals.includes(sig.interval)) {
            if (!signalMap[dateStr]) {
              signalMap[dateStr] = { '1h': '-', '2h': '-', '4h': '-', '1day': '-' };
            }
            signalMap[dateStr][sig.interval] = sig.signal_type as 'B' | 'S';
          }
        }

        const result = Object.entries(signalMap)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, days)
          .map(([date, sigs]) => ({ date, ...sigs }));

        return jsonResponse({ symbol, days, data: result });
      }

      const commentsMatch = path.match(/^\/api\/comments\/([^/]+)$/);
      if (commentsMatch && method === 'GET') {
        let symbol = decodeURIComponent(commentsMatch[1]).replace('BTC-USD', 'BTC/USD');
        const { getCommentsBySymbol } = await import('./database');
        const comments = await getCommentsBySymbol(symbol);
        return jsonResponse({ comments });
      }

      if (path === '/api/signals-summary' && method === 'GET') {
        const { getLatestSignals } = await import('./database');
        const summary = await getLatestSignals();
        return jsonResponse({ summary });
      }

      if (path === '/api/fetch' && method === 'POST') {
        // Get optional parameters
        const symbol = url.searchParams.get('symbol');
        const interval = url.searchParams.get('interval');

        await doManualFetch(symbol, interval);
        return jsonResponse({ success: true, message: 'Data fetch initiated' });
      }

      // Health check
      if (path === '/health') {
        return jsonResponse({ status: 'ok' });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error: any) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }
  },

  // 本地手动触发（Vercel 负责定时抓取）
  async function doManualFetch(symbolParam?: string | null, intervalParam?: string | null): Promise<void> {
  const symbolsToFetch = symbolParam ? [symbolParam] : SYMBOLS;
  const intervalsToFetch = intervalParam ? [intervalParam] : INTERVALS.filter(i => i !== '1week' && i !== '1month');

  // For scheduled fetch, use incremental update (get latest datetime from DB)
  // For manual fetch with specific symbol, fetch more data to ensure we have latest
  const useIncremental = !symbolParam;

  // Process one symbol+interval at a time to avoid CPU limit
  for (const symbol of symbolsToFetch) {
    for (const interval of intervalsToFetch) {
      let startDate: string | undefined;

      if (useIncremental) {
        // Get latest datetime from database for incremental update
        const latest = await getLatestDatetime(symbol as string, interval as string);
        if (latest) {
          // Fetch from the day AFTER latest data (not before!)
          const latestDate = new Date(latest.split(' ')[0]);
          latestDate.setDate(latestDate.getDate() + 1);
          startDate = latestDate.toISOString().split('T')[0];
          console.log(`Incremental fetch ${symbol} ${interval} since ${startDate} (latest: ${latest})`);
        } else {
          // No data yet, fetch 60 days to ensure enough data for MA calculation
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          startDate = sixtyDaysAgo.toISOString().split('T')[0];
          console.log(`Full fetch ${symbol} ${interval} since ${startDate} (no existing data)`);
        }
      } else {
        // Manual fetch - get 7 days to ensure we have latest
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        startDate = sevenDaysAgo.toISOString().split('T')[0];
        console.log(`Manual fetch ${symbol} ${interval} since ${startDate}`);
      }

      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, startDate);

      if (data.length > 0) {
        await upsertStockData(symbol as any, interval as Interval, data);
        console.log(`Saved ${data.length} records for ${symbol}/${interval}`);

        await processStockData(symbol as any, interval as string);
      } else {
        console.log(`No new data for ${symbol} ${interval}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

function jsonResponse(data: any, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
}