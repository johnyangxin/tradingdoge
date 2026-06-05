import dotenv from 'dotenv';
import { SYMBOLS, INTERVALS, Interval } from '../src/types';
import { upsertStockData, getLatestDatetime } from '../src/database';
import { fetchTimeSeries } from '../src/twelvedata';
import { processStockData } from '../src/signals';

dotenv.config();

// 只有这几个间隔（排除 1week 和 1month）
const INTERVALS_TO_FETCH = INTERVALS.filter(i => i !== '1week' && i !== '1month');

// Twelvedata 免费版每分钟 8 次请求，每支股票后等待
const DELAY_BETWEEN_CALLS_MS = 60000;

async function main() {
  console.log('Fetching stock data (incremental update)...');

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS_TO_FETCH) {
      let startDate: string | undefined;

      const latest = await getLatestDatetime(symbol as string, interval as string);
      if (latest) {
        startDate = latest.split(' ')[0];
        console.log(`[${symbol}/${interval}] Fetching since ${startDate} (latest: ${latest})`);
      } else {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        startDate = sixtyDaysAgo.toISOString().split('T')[0];
        console.log(`[${symbol}/${interval}] Full fetch since ${startDate}`);
      }

      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, startDate);

      if (data.length > 0) {
        await upsertStockData(symbol as any, interval as Interval, data);
        console.log(`[${symbol}/${interval}] Saved ${data.length} records`);
      } else {
        console.log(`[${symbol}/${interval}] No new data`);
      }

      await processStockData(symbol as any, interval as string);

      // 每支股票后等待 60s（Twelvedata 免费版每分钟 8 次请求限制）
      console.log(`Waiting ${DELAY_BETWEEN_CALLS_MS / 1000}s before next...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
    }
  }

  console.log('Data fetch complete');
}

main().catch(console.error);