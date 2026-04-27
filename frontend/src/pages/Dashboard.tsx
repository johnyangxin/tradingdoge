import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchSignalsSummary, SignalsSummary } from '../api';

export function Dashboard() {
  const [data, setData] = useState<SignalsSummary['summary']>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchSignalsSummary();
      setData(result.summary);
    } catch (error) {
      console.error('Failed to load signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const intervals = ['1h', '2h', '4h', '1day'];

  const getSignalClass = (signal: string | undefined) => {
    if (!signal) return 'signal-empty';
    return signal === 'B' ? 'signal-b' : 'signal-s';
  };

  const getSignalText = (signal: string | undefined) => {
    if (!signal) return '-';
    return signal;
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard-page">
      <h1 className="page-title">SIGNALS DASHBOARD</h1>
      <button onClick={loadData} className="refresh-btn">Refresh</button>

      <div className="table-container">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>1h</th>
              <th>2h</th>
              <th>4h</th>
              <th>1day</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data).map(([symbol, intervalsData]) => (
              <tr key={symbol}>
                <td className="symbol-cell">{symbol}</td>
                {intervals.map(int => (
                  <td key={int} className={getSignalClass(intervalsData[int]?.signal_type)}>
                    {getSignalText(intervalsData[int]?.signal_type)}
                  </td>
                ))}
                <td>
                  <Link to={`/stock/${encodeURIComponent(symbol).replace('BTC%2FUSD', 'BTC-USD')}`} className="detail-link">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span className="legend-item"><span className="signal-b">B</span> Bullish</span>
        <span className="legend-item"><span className="signal-s">S</span> Bearish</span>
        <span className="legend-item"><span className="signal-empty">-</span> No Signal</span>
      </div>
    </div>
  );
}