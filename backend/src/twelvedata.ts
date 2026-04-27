import axios from 'axios';
import { OHLCV, SYMBOLS, INTERVALS, Interval } from './types';

const API_KEY = process.env.TWELVEDATA_API_KEY || '7c16a4111f8740719dab9fbef106313f';
const BASE_URL = 'https://api.twelvedata.com/time_series';

// 从Twelvedata获取数据
export async function fetchTimeSeries(
  symbol: string,
  interval: Interval,
  output_size: number = 360,
  start_date?: string
): Promise<OHLCV[]> {
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
      // 如果是速率限制错误，等待后重试
      if (response.data.message && response.data.message.includes('API credits')) {
        console.log(`Rate limited for ${symbol}/${interval}, waiting 60s and retrying...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        const retryResponse = await axios.get(BASE_URL, { params });
        if (retryResponse.data.status === 'ok' && retryResponse.data.values) {
          return retryResponse.data.values.reverse().map((v: any) => ({
            datetime: v.datetime,
            open: parseFloat(v.open || '0'),
            high: parseFloat(v.high || '0'),
            low: parseFloat(v.low || '0'),
            close: parseFloat(v.close || '0'),
            volume: v.volume ? parseFloat(v.volume) : 0
          }));
        }
      }
      console.error(`Twelvedata API error for ${symbol}/${interval}:`, response.data.message || response.data.code || response.data.status);
      return [];
    }

    if (!response.data.values || !Array.isArray(response.data.values)) {
      console.warn(`No data returned for ${symbol}/${interval}`);
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
    console.error(`Error fetching ${symbol}/${interval}:`, error.message);
    return [];
  }
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