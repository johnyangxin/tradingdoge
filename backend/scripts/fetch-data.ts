import dotenv from 'dotenv';
import { SYMBOLS, INTERVALS, Interval } from '../src/types';
import { upsertStockData, getLatestDatetime } from '../src/database';
import { fetchTimeSeries } from '../src/twelvedata';
import { processStockData } from '../src/signals';

dotenv.config();

async function main() {
  console.log('Fetching stock data (full refresh)...');

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      console.log(`Fetching ${symbol} ${interval}...`);
      // 每次获取最新的 400 条数据，由 upsert 处理重复
      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400);

      if (data.length > 0) {
        upsertStockData(symbol as any, interval as Interval, data);
        console.log(`Saved ${data.length} records`);

        // 处理信号
        await processStockData(symbol as any, interval as string);
      } else {
        console.log(`No new data for ${symbol} ${interval}`);
      }

      // 延迟避免API限流
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Data fetch complete');
}

main().catch(console.error);