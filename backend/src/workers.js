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
const types_1 = require("./types");
const database_1 = require("./database");
const twelvedata_1 = require("./twelvedata");
const signals_1 = require("./signals");
// Cloudflare Workers handler - 只读 API（定时抓取已移至 Vercel）
exports.default = {
    async fetch(request, env) {
        // Set env for database wrapper
        globalThis.env = env;
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        // Only handle /api/* paths, pass through others
        if (!path.startsWith('/api/')) {
            return new Response('Not Found', { status: 404 });
        }
        try {
            // Initialize database
            await (0, database_1.initDatabase)();
            // Route handling
            if (path === '/api/stocks' && method === 'GET') {
                const stocks = types_1.SYMBOLS.map(s => ({
                    symbol: s,
                    name: s === 'SPY' ? 'S&P 500 ETF' : s === 'BTC/USD' ? 'Bitcoin' : s === 'UVIX' ? 'Invesco NASDAQ 100 Low Volatility ETN' : s === 'GLD' ? 'SPDR Gold Shares' : s
                }));
                return jsonResponse(stocks);
            }
            const stockMatch = path.match(/^\/api\/stock\/([^/]+)$/);
            if (stockMatch && method === 'GET') {
                let symbol = decodeURIComponent(stockMatch[1]).replace('BTC-USD', 'BTC/USD');
                const interval = url.searchParams.get('interval') || '1day';
                const { getCandlesWithMA } = await Promise.resolve().then(() => __importStar(require('./signals')));
                const data = await getCandlesWithMA(symbol, interval);
                return jsonResponse({ symbol, interval, data });
            }
            const signalsMatch = path.match(/^\/api\/signals\/([^/]+)$/);
            if (signalsMatch && method === 'GET') {
                let symbol = decodeURIComponent(signalsMatch[1]).replace('BTC-USD', 'BTC/USD');
                const days = parseInt(url.searchParams.get('days') || '30');
                const { getSignals } = await Promise.resolve().then(() => __importStar(require('./database')));
                const signals = await getSignals(symbol, days);
                return jsonResponse({ symbol, days, signals });
            }
            const signalsDailyMatch = path.match(/^\/api\/signals-daily\/([^/]+)$/);
            if (signalsDailyMatch && method === 'GET') {
                let symbol = decodeURIComponent(signalsDailyMatch[1]).replace('BTC-USD', 'BTC/USD');
                const days = 10;
                const { getSignals } = await Promise.resolve().then(() => __importStar(require('./database')));
                const signals = await getSignals(symbol, days);
                const intervals = ['1h', '2h', '4h', '1day'];
                const signalMap = {};
                for (const sig of signals) {
                    const dateStr = sig.datetime.split(' ')[0].split('T')[0];
                    if (intervals.includes(sig.interval)) {
                        if (!signalMap[dateStr]) {
                            signalMap[dateStr] = { '1h': '-', '2h': '-', '4h': '-', '1day': '-' };
                        }
                        signalMap[dateStr][sig.interval] = sig.signal_type;
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
                const { getCommentsBySymbol } = await Promise.resolve().then(() => __importStar(require('./database')));
                const comments = await getCommentsBySymbol(symbol);
                return jsonResponse({ comments });
            }
            if (path === '/api/signals-summary' && method === 'GET') {
                const { getLatestSignals } = await Promise.resolve().then(() => __importStar(require('./database')));
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
        }
        catch (error) {
            return jsonResponse({ error: error.message }, { status: 500 });
        }
    },
    // 本地手动触发（Vercel 负责定时抓取）
    function: doManualFetch(symbolParam ?  : string | null, intervalParam ?  : string | null), void:  > {
        const: symbolsToFetch = symbolParam ? [symbolParam] : types_1.SYMBOLS,
        const: intervalsToFetch = intervalParam ? [intervalParam] : types_1.INTERVALS.filter(i => i !== '1week' && i !== '1month'),
        // For scheduled fetch, use incremental update (get latest datetime from DB)
        // For manual fetch with specific symbol, fetch more data to ensure we have latest
        const: useIncremental = !symbolParam,
        // Process one symbol+interval at a time to avoid CPU limit
        for(, symbol, of, symbolsToFetch) {
            for (const interval of intervalsToFetch) {
                let startDate;
                if (useIncremental) {
                    // Get latest datetime from database for incremental update
                    const latest = await (0, database_1.getLatestDatetime)(symbol, interval);
                    if (latest) {
                        // Fetch from the day AFTER latest data (not before!)
                        const latestDate = new Date(latest.split(' ')[0]);
                        latestDate.setDate(latestDate.getDate() + 1);
                        startDate = latestDate.toISOString().split('T')[0];
                        console.log(`Incremental fetch ${symbol} ${interval} since ${startDate} (latest: ${latest})`);
                    }
                    else {
                        // No data yet, fetch 60 days to ensure enough data for MA calculation
                        const sixtyDaysAgo = new Date();
                        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                        startDate = sixtyDaysAgo.toISOString().split('T')[0];
                        console.log(`Full fetch ${symbol} ${interval} since ${startDate} (no existing data)`);
                    }
                }
                else {
                    // Manual fetch - get 7 days to ensure we have latest
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    startDate = sevenDaysAgo.toISOString().split('T')[0];
                    console.log(`Manual fetch ${symbol} ${interval} since ${startDate}`);
                }
                const data = await (0, twelvedata_1.fetchTimeSeries)(symbol, interval, 400, startDate);
                if (data.length > 0) {
                    await (0, database_1.upsertStockData)(symbol, interval, data);
                    console.log(`Saved ${data.length} records for ${symbol}/${interval}`);
                    await (0, signals_1.processStockData)(symbol, interval);
                }
                else {
                    console.log(`No new data for ${symbol} ${interval}`);
                }
                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    },
    function: jsonResponse(data, any, init ?  : ResponseInit), Response
};
{
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers }
    });
}
