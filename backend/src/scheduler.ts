import cron from 'node-cron';
import { SYMBOLS, INTERVALS, Interval } from './types';
import { upsertStockData, getLatestDatetime, getStockData, getAllDates } from './database';
import { fetchTimeSeries, fetchAllData } from './twelvedata';
import { processStockData } from './signals';

// 校验数据完整性
export async function validateAndFetchIncomplete() {
  const results: { symbol: string; interval: string; status: string }[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      // 获取数据库中该 symbol+interval 的所有日期
      const dates = await getAllDates(symbol as string, interval as string);
      const dbDates = new Set(dates.map(d => d.datetime.split(' ')[0]));

      // 获取今天的日期（纽约时间）
      const now = new Date();
      const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const todayNY = nyTime.toISOString().split('T')[0];

      // 获取今天的完整数据
      const todayData = await getStockData(symbol as string, interval as string, 1);
      const latestDate = todayData[0]?.datetime?.split(' ')[0];

      // 检查：今天是否已有数据
      if (latestDate === todayNY) {
        results.push({ symbol, interval, status: 'complete' });
      } else {
        // 数据不完整，执行手动获取
        console.log(`Incomplete: ${symbol}/${interval}, latest: ${latestDate}, today: ${todayNY}`);

        const latestDatetime = await getLatestDatetime(symbol as string, interval as string);
        const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, latestDatetime || undefined);

        if (data.length > 0) {
          await upsertStockData(symbol as any, interval as Interval, data);
          await processStockData(symbol as any, interval as string);
          results.push({ symbol, interval, status: 'fetched' });
          console.log(`Fetched ${data.length} records for ${symbol}/${interval}`);
        } else {
          results.push({ symbol, interval, status: 'no_data' });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return results;
}

// 定时任务：每天美股收盘后执行（美东时间19:00）
// 美股交易时间: 9:30-16:00 ET，周一至周五
export function startScheduler() {
  console.log('Scheduler started - fetch at 19:00 ET, validate at 21:00 ET Mon-Fri');

  // 19:00 - 主数据获取
  cron.schedule('0 19 * * 1-5', async () => {
    console.log('Running scheduled data fetch at 19:00 ET...');

    try {
      for (const symbol of SYMBOLS) {
        for (const interval of INTERVALS) {
          const latestDatetime = await getLatestDatetime(symbol as string, interval as string);
          console.log(`Fetching ${symbol} ${interval}...`);
          const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, latestDatetime || undefined);

          if (data.length > 0) {
            await upsertStockData(symbol as any, interval as Interval, data);
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

  // 21:00 - 校验并补全数据
  cron.schedule('0 21 * * 1-5', async () => {
    console.log('Running validation at 21:00 ET...');

    try {
      const results = await validateAndFetchIncomplete();
      console.log('Validation results:', results);
      console.log('Validation complete');
    } catch (error) {
      console.error('Error in validation:', error);
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
      const latestDatetime = await getLatestDatetime(symbol as string, interval as string);

      console.log(`Fetching ${symbol} ${interval}...`);
      // 传入 start_date 实现递增获取
      const data = await fetchTimeSeries(symbol as any, interval as Interval, 400, latestDatetime || undefined);

      if (data.length > 0) {
        await upsertStockData(symbol as any, interval as Interval, data);
        console.log(`Saved ${data.length} records`);
      } else {
        console.log(`No new data for ${symbol} ${interval}`);
      }

      // 不管有没有新数据，都重新计算信号
      await processStockData(symbol as any, interval as string);

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Manual fetch complete');
}