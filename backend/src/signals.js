"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSMA = calculateSMA;
exports.detectCrossovers = detectCrossovers;
exports.processStockData = processStockData;
exports.getCandlesWithMA = getCandlesWithMA;
exports.checkAndNotifyAllBSignal = checkAndNotifyAllBSignal;
const database_1 = require("./database");
const notifier_1 = require("./notifier");
// 计算简单移动平均线
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        }
        else {
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
function detectCrossovers(symbol, interval, data) {
    const signals = [];
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
        }
        else if (currMa25 < currMa90) {
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
async function processStockData(symbol, interval) {
    const data = await (0, database_1.getStockData)(symbol, interval, 400);
    if (data.length < 90) {
        console.log(`Not enough data for ${symbol}/${interval}: ${data.length} records`);
        return;
    }
    const signals = detectCrossovers(symbol, interval, data);
    if (signals.length > 0) {
        console.log(`Found ${signals.length} new signals for ${symbol}/${interval}`);
        for (const signal of signals) {
            await (0, database_1.insertSignal)(signal);
            console.log(`  ${signal.datetime} ${signal.signal_type} at ${signal.price}`);
        }
        // 处理完 1day 信号后，检查是否需要发送全 B/全 S 通知
        if (interval === '1day') {
            await checkAndNotifyAllBSignal(symbol);
        }
    }
}
async function getCandlesWithMA(symbol, interval, limit) {
    const data = await (0, database_1.getStockData)(symbol, interval, limit);
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
async function checkAndNotifyAllBSignal(symbol) {
    const intervals = ['1h', '2h', '4h', '1day'];
    const latestSignals = {};
    // 获取每个时间周期的最新信号
    for (const interval of intervals) {
        const signals = await (0, database_1.getSignals)(symbol, 3); // 最近3天
        const filtered = signals.filter(s => s.interval === interval);
        latestSignals[interval] = filtered.length > 0 ? filtered[0].signal_type : null;
    }
    // 检查是否全 B 或全 S
    const signalValues = Object.values(latestSignals).filter(s => s !== null);
    if (signalValues.length < 4) {
        return; // 信号不足4个，不发送通知
    }
    const allB = signalValues.every(s => s === 'B');
    const allS = signalValues.every(s => s === 'S');
    if (allB) {
        // 获取当前价格
        const data = await (0, database_1.getStockData)(symbol, '1day', 1);
        const price = data.length > 0 ? data[data.length - 1].close : 0;
        console.log(`All B signals detected for ${symbol}, sending notification...`);
        await (0, notifier_1.notifyAllBSignal)(symbol, 'B', price);
    }
    else if (allS) {
        const data = await (0, database_1.getStockData)(symbol, '1day', 1);
        const price = data.length > 0 ? data[data.length - 1].close : 0;
        console.log(`All S signals detected for ${symbol}, sending notification...`);
        await (0, notifier_1.notifyAllBSignal)(symbol, 'S', price);
    }
}
