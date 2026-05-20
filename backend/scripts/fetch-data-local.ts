import dotenv from 'dotenv';
import { SYMBOLS, INTERVALS, Interval } from '../src/types';
import { upsertStockData, getLatestDatetime } from '../src/database';
import { fetchTimeSeries } from '../src/twelvedata';
import { processStockData } from '../src/signals';

dotenv.config();

// 只获取这几个间隔（排除 1week 和 1month）
const INTERVALS_TO_FETCH = INTERVALS.filter(i => i !== '1week' && i !== '1month');

async function main() {
  console.log('Fetching stock data (incremental update)...');

  // 增量更新 - 对于每个 symbol 和 interval，获取最新数据之后的新数据
  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS_TO_FETCH) {
      let startDate: string | undefined;

      // 获取最新 datetime
      const latest = await getLatestDatetime(symbol as string, interval as string);
      if (latest) {
        // 从最新数据的下一天开始获取
        const latestDate = new Date(latest.split(' ')[0]);
        latestDate.setDate(latestDate.getDate() + 1);
        startDate = latestDate.toISOString().split('T')[0];
        console.log(`Incremental fetch ${symbol} ${interval} since ${startDate} (latest: ${latest})`);
      } else {
        // 首次获取，获取 60 天数据
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        startDate = sixtyDaysAgo.toISOString().split('T')[0];
        console.log(`Full fetch ${symbol} ${interval} since ${startDate} (no existing data)`);
      }

      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, startDate);

      if (data.length > 0) {
        upsertStockData(symbol as any, interval as Interval, data);
        console.log(`Saved ${data.length} records`);

        // 处理信号
        await processStockData(symbol as any, interval as string);
      } else {
        console.log(`No new data for ${symbol} ${interval}`);
      }

      // 延迟避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Data fetch complete');
}

main().catch(console.error);