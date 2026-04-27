import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchStocks, Stock } from '../api';
import './StockList.css';

export const StockList: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStocks().then(data => {
      setStocks(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="stock-list">
      <h1 className="page-title">TRADINGDOGE</h1>
      <div className="stock-grid">
        {stocks.map(stock => (
          <Link key={stock.symbol} to={`/stock/${encodeURIComponent(stock.symbol).replace('BTC%2FUSD', 'BTC-USD')}`} className="stock-card">
            <div className="stock-symbol">{stock.symbol}</div>
            <div className="stock-name">{stock.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default StockList;