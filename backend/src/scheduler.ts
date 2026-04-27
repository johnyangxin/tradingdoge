import cron from 'node-cron';
import { SYMBOLS, INTERVALS, Interval } from './types';
import { upsertStockData, getLatestDatetime } from './database';
import { fetchTimeSeries, fetchAllData } from './twelvedata';
import { processStockData } from './signals';

// 定时任务：每天美股收盘后3小时执行（美东时间19:00，即16:00收盘+3小时）
// 美股交易时间: 9:30-16:00 ET，周一至周五
export function startScheduler() {
  console.log('Scheduler started - will run at 19:00 ET Mon-Fri (3 hours after market close)');

  cron.schedule('0 19 * * 1-5', async () => {
    console.log('Running scheduled data fetch...');

    try {
      // 存储到数据库（使用递增获取）
      for (const symbol of SYMBOLS) {
        for (const interval of INTERVALS) {
          // 获取当前最新时间戳
          const latestDatetime = getLatestDatetime(symbol as string, interval as string);

          console.log(`Fetching ${symbol} ${interval}...`);
          const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, latestDatetime || undefined);

          if (data.length > 0) {
            // 数据可能已有变更，需要覆盖
            upsertStockData(symbol as any, interval as Interval, data);
            console.log(`Saved ${data.length} records for ${symbol}/${interval}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 处理信号
      for (const symbol of SYMBOLS) {
        for (const interval of INTERVALS) {
          await processStockData(symbol as any, interval as string);
        }
      }

      console.log('Scheduled data fetch complete');
    } catch (error) {
      console.error('Error in scheduled data fetch:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
}

// 手动触发数据更新
export async function manualFetch() {
  console.log('Manual fetch triggered...');

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      // 获取当前数据库中该 symbol+interval 的最新时间戳
      const latestDatetime = getLatestDatetime(symbol as string, interval as string);

      console.log(`Fetching ${symbol} ${interval}...`);
      // 传入 start_date 实现递增获取
      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, latestDatetime || undefined);

      if (data.length > 0) {
        upsertStockData(symbol as any, interval as Interval, data);
        console.log(`Saved ${data.length} records`);

        // 处理信号
        await processStockData(symbol as any, interval as string);
      } else {
        console.log(`No new data for ${symbol} ${interval}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Manual fetch complete');
}