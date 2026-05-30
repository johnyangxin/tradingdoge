import axios from 'axios';
import { OHLCV, SYMBOLS, INTERVALS, Interval } from './types';

const API_KEY = process.env.TWELVEDATA_API_KEY || '7c16a4111f8740719dab9fbef106313f';
const BASE_URL = 'https://api.twelvedata.com/time_series';

// 从Twelvedata获取数据，带重试机制
export async function fetchTimeSeries(
  symbol: string,
  interval: Interval,
  output_size: number = 360,
  start_date?: string,
  maxRetries: number = 3
): Promise<OHLCV[]> {
  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const params: any = {
        symbol,
        interval,
        outputsize: output_size,
        apikey: API_KEY,
        format: 'JSON'
      };

      // 如果指定了 start_date，只获取该日期之后的数据（用于递增获取）
      if (start_date) {
        params.start_date = start_date;
      }

      const response = await axios.get(BASE_URL, { params });

      // 检查 API 错误响应
      if (response.data.code === 400 || response.data.code === 403 || response.data.status === 'error') {
        lastError = response.data.message || response.data.code || response.data.status;

        // 400/404 错误（日期不存在等），不需要重试
        if (response.data.code === 400 || response.data.code === 404) {
          if (lastError.includes('No data is available') || lastError.includes('Try setting different')) {
            console.log(`[${symbol}/${interval}] No new data (date range invalid), skipping`);
            return [];
          }
        }

        // 速率限制，等待后重试
        if (lastError.includes('API credits')) {
          const waitTime = Math.min(attempt * 30000, 120000); // 30s, 60s, 90s (max 2min)
          console.log(`[${symbol}/${interval}] Rate limited, waiting ${waitTime/1000}s (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // 其他错误不重试
        console.error(`[${symbol}/${interval}] API error: ${lastError}`);
        return [];
      }

      if (!response.data.values || !Array.isArray(response.data.values)) {
        console.warn(`[${symbol}/${interval}] No data returned`);
        return [];
      }

      // 返回反转的数据（最早的在前，用于计算均线）
      return response.data.values.reverse().map((v: any) => ({
        datetime: v.datetime,
        open: parseFloat(v.open || '0'),
        high: parseFloat(v.high || '0'),
        low: parseFloat(v.low || '0'),
        close: parseFloat(v.close || '0'),
        volume: v.volume ? parseFloat(v.volume) : 0
      }));
    } catch (error: any) {
      lastError = error.message;
      console.error(`[${symbol}/${interval}] Error: ${lastError} (attempt ${attempt}/${maxRetries})`);

      // 网络错误，等待后重试
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.error(`[${symbol}/${interval}] Failed after ${maxRetries} attempts: ${lastError}`);
  return [];
}

// 获取所有标的和时段的数据
export async function fetchAllData(): Promise<void> {
  console.log('Starting data fetch...');

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      console.log(`Fetching ${symbol} ${interval}...`);
      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400);

      if (data.length > 0) {
        console.log(`  Got ${data.length} records`);
      }

      // 稍作延迟避免API限流
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Data fetch complete');
}