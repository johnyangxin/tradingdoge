import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchStockData, fetchDailySignals, OHLCV, Interval, INTERVALS, DailySignal } from '../api';
import StockChart from '../components/Chart';
import { CommentSection } from '../components/CommentSection';
import './StockDetail.css';

export const StockDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [interval, setInterval] = useState<Interval>('1day');
  const [data, setData] = useState<OHLCV[]>([]);
  const [dailySignals, setDailySignals] = useState<DailySignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;

    setLoading(true);
    Promise.all([
      fetchStockData(symbol, interval),
      fetchDailySignals(symbol)
    ]).then(([stockData, signalData]) => {
      setData(stockData.data);
      setDailySignals(signalData.data);
      setLoading(false);
    });
  }, [symbol, interval]);

  // 转换数据格式给Chart使用
  const chartData = data.map(d => ({
    time: Math.floor(new Date(d.datetime).getTime() / 1000) as any,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close
  }));

  const ma25Data = data
    .filter(d => d.ma25 !== null)
    .map(d => ({
      time: Math.floor(new Date(d.datetime).getTime() / 1000) as any,
      value: d.ma25!
    }));

  const ma90Data = data
    .filter(d => d.ma90 !== null)
    .map(d => ({
      time: Math.floor(new Date(d.datetime).getTime() / 1000) as any,
      value: d.ma90!
    }));

  return (
    <div className="stock-detail">
      <Link to="/" className="back-link">
        ← Back
      </Link>

      <div className="detail-header">
        <h1 className="detail-symbol">{symbol}</h1>
        <div className="interval-selector">
          {INTERVALS.map(int => (
            <button
              key={int}
              className={`interval-btn ${interval === int ? 'active' : ''}`}
              onClick={() => setInterval(int)}
            >
              {int}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-content">
        <div className="detail-main">
          <div className="chart-container">
            {loading ? (
              <div className="loading">Loading chart...</div>
            ) : (
              <StockChart data={chartData} ma25={ma25Data} ma90={ma90Data} />
            )}
            <div className="chart-watermark">Tradingdoge.com</div>
          </div>

          <div className="signals-section">
            <h2 className="signals-title">Daily Signals (Last 10 Days)</h2>
            <table className="signals-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>1h</th>
                  <th>2h</th>
                  <th>4h</th>
                  <th>1day</th>
                </tr>
              </thead>
              <tbody>
                {dailySignals.map(row => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td className={row['1h'] === 'B' ? 'signal-b' : row['1h'] === 'S' ? 'signal-s' : ''}>{row['1h']}</td>
                    <td className={row['2h'] === 'B' ? 'signal-b' : row['2h'] === 'S' ? 'signal-s' : ''}>{row['2h']}</td>
                    <td className={row['4h'] === 'B' ? 'signal-b' : row['4h'] === 'S' ? 'signal-s' : ''}>{row['4h']}</td>
                    <td className={row['1day'] === 'B' ? 'signal-b' : row['1day'] === 'S' ? 'signal-s' : ''}>{row['1day']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="detail-sidebar">
          <CommentSection symbol={symbol!} />
        </div>
      </div>
    </div>
  );
};

export default StockDetail;