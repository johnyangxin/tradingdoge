import { SYMBOLS, INTERVALS, Interval } from './types';
import { upsertStockData, getLatestDatetime, getStockData } from './database';
import { fetchTimeSeries } from './twelvedata';
import { processStockData } from './signals';

// 校验数据完整性
export async function validateAndFetchIncomplete() {
  const results: { symbol: string; interval: string; status: string }[] = [];

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
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