import { OHLCV, Signal, Interval } from './types';
import { insertSignal, signalExists, getStockData, getSignals, getAllUsersWithFavorites, getUserAlerts, hasAlertToday } from './database';
import { notifyAllBSignal, notifyUseralert } from './notifier';

export interface StopLossTakeProfit {
  entry: number;       // 建议开仓价
  stopLoss: number;
  takeProfit: number;
  atr: number;
}

export interface PriceActionLevels {
  support: number;    // 支撑位（近期低点）
  resistance: number; // 阻力位（近期高点）
  entry: number;      // 建议开仓价
  stopLoss: number;   // 止损价
  takeProfit: number; // 止盈价
}

// 基于 Price Action 理论找到关键价位
export function findKeyLevels(data: OHLCV[], lookback: number = 20): { support: number; resistance: number } {
  if (data.length < lookback) {
    lookback = data.length;
  }

  let support = data[data.length - 1].low;
  let resistance = data[data.length - 1].high;

  // 找最近 lookback 天内的最低点和最高点
  for (let i = data.length - lookback; i < data.length; i++) {
    if (data[i].low < support) support = data[i].low;
    if (data[i].high > resistance) resistance = data[i].high;
  }

  return { support, resistance };
}

// 基于 Price Action 计算开仓、止损、止盈
export function calculatePriceActionLevels(
  data: OHLCV[],
  signalType: 'B' | 'S'
): PriceActionLevels | null {
  if (data.length < 10) return null;

  const recentData = data.slice(-20);
  const currentPrice = data[data.length - 1].close;
  const atr = calculateATR(data);

  const { support, resistance } = findKeyLevels(data);
  const atrValue = atr || (currentPrice * 0.02); // 默认 2% 如果没有 ATR

  let entry: number;
  let stopLoss: number;
  let takeProfit: number;

  if (signalType === 'B') {
    // 做多：等价格回撤到支撑位附近时入场
    // 如果当前价已经高出支撑位超过 ATR，建议等回撤
    if (currentPrice - support > atrValue * 2) {
      // 价格已经上涨，等待回撤
      entry = support + atrValue * 0.5; // 支撑位上方一点点
    } else {
      // 价格接近支撑，可以现价入场
      entry = currentPrice;
    }
    // 止损放在支撑位下方
    stopLoss = support - atrValue;
    // 止盈放到阻力位
    takeProfit = resistance;
  } else {
    // 做空：等价格反弹到阻力位附近时入场
    if (resistance - currentPrice > atrValue * 2) {
      entry = resistance - atrValue * 0.5;
    } else {
      entry = currentPrice;
    }
    // 止损放在阻力位上方
    stopLoss = resistance + atrValue;
    // 止盈放到支撑位
    takeProfit = support;
  }

  return {
    support,
    resistance,
    entry,
    stopLoss,
    takeProfit
  };
}

// 计算真实波幅 (True Range)
function calculateTrueRange(data: OHLCV[]): (number | null)[] {
  const tr: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      tr.push(data[i].high - data[i].low);
    } else {
      const prevClose = data[i - 1].close;
      const hl = data[i].high - data[i].low;
      const hc = Math.abs(data[i].high - prevClose);
      const lc = Math.abs(data[i].low - prevClose);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  return tr;
}

// 计算 ATR (Average True Range) - 14 日周期
export function calculateATR(data: OHLCV[], period: number = 14): number | null {
  const tr = calculateTrueRange(data);

  // 需要至少 period 个数据点
  if (tr.filter(t => t !== null).length < period) {
    return null;
  }

  // 计算最后一个 period 的平均值
  let sum = 0;
  let count = 0;
  for (let i = tr.length - period; i < tr.length; i++) {
    if (tr[i] !== null) {
      sum += tr[i];
      count++;
    }
  }

  return count > 0 ? sum / count : null;
}

// 根据当前价格和信号类型计算止盈止损
export function calculateStopLossTakeProfit(
  currentPrice: number,
  signalType: 'B' | 'S',
  _atr: number,
  support: number,
  resistance: number
): StopLossTakeProfit {
  const atrValue = _atr || currentPrice * 0.02;

  if (signalType === 'B') {
    let entry: number;
    if (currentPrice - support > atrValue * 2) {
      entry = support + atrValue * 0.5;
    } else {
      entry = currentPrice;
    }
    const stopLoss = support - atrValue;
    const takeProfit = resistance;
    return { entry, stopLoss, takeProfit, atr: atrValue };
  } else {
    let entry: number;
    if (resistance - currentPrice > atrValue * 2) {
      entry = resistance - atrValue * 0.5;
    } else {
      entry = currentPrice;
    }
    const stopLoss = resistance + atrValue;
    const takeProfit = support;
    return { entry, stopLoss, takeProfit, atr: atrValue };
  }
}

// 计算简单移动平均线
export function calculateSMA(data: OHLCV[], period: number): (number | null)[] {
  const sma: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      sma.push(sum / period);
    }
  }

  return sma;
}

// 检测当前均线状态并生成信号
export function detectCrossovers(
  symbol: string,
  interval: string,
  data: OHLCV[]
): Signal[] {
  const signals: Signal[] = [];

  // 计算25日和90日均线
  const ma25 = calculateSMA(data, 25);
  const ma90 = calculateSMA(data, 90);

  for (let i = 1; i < data.length; i++) {
    const currMa25 = ma25[i];
    const currMa90 = ma90[i];

    // 跳过无效数据
    if (currMa25 === null || currMa90 === null) {
      continue;
    }

    // 多头状态: MA25 > MA90 = B
    // 空头状态: MA25 < MA90 = S
    // 每天都要生成信号，不管前一天是什么状态
    if (currMa25 > currMa90) {
      signals.push({
        symbol,
        interval,
        signal_type: 'B',
        datetime: data[i].datetime,
        price: data[i].close
      });
    } else if (currMa25 < currMa90) {
      signals.push({
        symbol,
        interval,
        signal_type: 'S',
        datetime: data[i].datetime,
        price: data[i].close
      });
    }
  }

  return signals;
}

// 处理股票数据并生成信号
export async function processStockData(symbol: string, interval: string): Promise<void> {
  const data = await getStockData(symbol, interval, 400);

  if (data.length < 90) {
    console.log(`Not enough data for ${symbol}/${interval}: ${data.length} records`);
    return;
  }

  const signals = detectCrossovers(symbol, interval, data);

  if (signals.length > 0) {
    console.log(`Found ${signals.length} new signals for ${symbol}/${interval}`);

    for (const signal of signals) {
      await insertSignal(signal);
      console.log(`  ${signal.datetime} ${signal.signal_type} at ${signal.price}`);
    }

    // 处理完 1day 信号后，检查是否需要发送全 B/全 S 通知
    if (interval === '1day') {
      await checkAndNotifyAllBSignal(symbol);
    }
  }
}

// 获取带均线的K线数据
export interface CandleWithMA {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma25: number | null;
  ma90: number | null;
}

export async function getCandlesWithMA(symbol: string, interval: string, limit?: number): Promise<CandleWithMA[]> {
  const data = await getStockData(symbol, interval, limit);
  const ma25 = calculateSMA(data, 25);
  const ma90 = calculateSMA(data, 90);

  return data.map((d, i) => ({
    datetime: d.datetime,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    ma25: ma25[i],
    ma90: ma90[i]
  }));
}

// 检查并发送全 B/全 S 信号通知
export async function checkAndNotifyAllBSignal(symbol: string): Promise<void> {
  const intervals = ['1h', '2h', '4h', '1day'];
  const latestSignals: { [key: string]: string | null } = {};

  // 获取每个时间周期的最新信号
  for (const interval of intervals) {
    const signals = await getSignals(symbol, interval, 3); // 最近3天
    latestSignals[interval] = signals.length > 0 ? signals[0].signal_type : null;
  }

  // 检查是否全 B 或全 S
  const signalValues = Object.values(latestSignals).filter(s => s !== null) as string[];
  if (signalValues.length < 4) {
    return; // 信号不足4个，不发送通知
  }

  const allB = signalValues.every(s => s === 'B');
  const allS = signalValues.every(s => s === 'S');

  if (allB) {
    // 获取当前价格并计算止盈止损
    const data = await getStockData(symbol, '1day', 25);
    const price = data.length > 0 ? data[data.length - 1].close : 0;
    const { support, resistance } = findKeyLevels(data);
    const atr = calculateATR(data);
    const sltp = atr ? calculateStopLossTakeProfit(price, 'B', atr, support, resistance) : null;
    console.log(`All B signals detected for ${symbol}, current price: $${price}, Support: $${support.toFixed(2)}, Resistance: $${resistance.toFixed(2)}, Entry: $${sltp?.entry.toFixed(2)}, SL: $${sltp?.stopLoss.toFixed(2)}, TP: $${sltp?.takeProfit.toFixed(2)}`);

    // 为每个关注该股票的用户发送通知
    const users = await getAllUsersWithFavorites();
    const relevantUsers = users.filter(u => u.symbol === symbol);
    for (const user of relevantUsers) {
      const alreadyAlerted = await hasAlertToday(user.userId, symbol, 'B');
      if (!alreadyAlerted) {
        await notifyUseralert(user.userId, symbol, 'B', price, sltp ?? undefined);
      }
    }

    await notifyAllBSignal(symbol, 'B', price, sltp ?? undefined);
  } else if (allS) {
    const data = await getStockData(symbol, '1day', 25);
    const price = data.length > 0 ? data[data.length - 1].close : 0;
    const { support, resistance } = findKeyLevels(data);
    const atr = calculateATR(data);
    const sltp = atr ? calculateStopLossTakeProfit(price, 'S', atr, support, resistance) : null;
    console.log(`All S signals detected for ${symbol}, current price: $${price}, Support: $${support.toFixed(2)}, Resistance: $${resistance.toFixed(2)}, Entry: $${sltp?.entry.toFixed(2)}, SL: $${sltp?.stopLoss.toFixed(2)}, TP: $${sltp?.takeProfit.toFixed(2)}`);

    // 为每个关注该股票的用户发送通知
    const users = await getAllUsersWithFavorites();
    const relevantUsers = users.filter(u => u.symbol === symbol);
    for (const user of relevantUsers) {
      const alreadyAlerted = await hasAlertToday(user.userId, symbol, 'S');
      if (!alreadyAlerted) {
        await notifyUseralert(user.userId, symbol, 'S', price, sltp ?? undefined);
      }
    }

    await notifyAllBSignal(symbol, 'S', price, sltp ?? undefined);
  }
}