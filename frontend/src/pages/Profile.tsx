import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAlerts, checkAlerts, Alert } from '../api';
import './Profile.css';

interface Favorite {
  symbol: string;
  name: string;
}

const STOCK_NAMES: Record<string, string> = {
  'SPY': 'S&P 500 ETF',
  'BTC/USD': 'Bitcoin',
  'UVIX': 'NASDAQ 100 Low Volatility',
  'GLD': 'SPDR Gold Shares'
};

export default function Profile() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadFavorites();
    loadAlerts();
  }, [token]);

  const loadFavorites = async () => {
    try {
      const res = await fetch('/api/user/favorites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      const favs: Favorite[] = (data.favorites || []).map((sym: string) => ({
        symbol: sym,
        name: STOCK_NAMES[sym] || sym
      }));
      setFavorites(favs);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const data = await getAlerts(token!);
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  const handleCheckAlerts = async () => {
    try {
      await checkAlerts(token!);
      loadAlerts();
    } catch (error) {
      console.error('Failed to check alerts:', error);
    }
  };

  const handleRemoveFavorite = async (symbol: string) => {
    if (!token) return;

    try {
      await fetch(`/api/user/favorites/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setFavorites(favorites.filter(f => f.symbol !== symbol));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>

      <div className="profile-section">
        <div className="profile-card">
          <div className="profile-label">Email</div>
          <div className="profile-value">{user?.email}</div>
        </div>

        <div className="profile-card">
          <div className="profile-label">Member Since</div>
          <div className="profile-value">-</div>
        </div>
      </div>

      <h2 className="profile-section-title">Favorites</h2>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : favorites.length === 0 ? (
        <div className="profile-empty">
          <p>No favorites yet</p>
          <Link to="/" className="profile-browse-link">Browse stocks</Link>
        </div>
      ) : (
        <div className="favorites-list">
          {favorites.map(fav => (
            <div key={fav.symbol} className="favorite-item">
              <Link to={`/stock/${fav.symbol}`} className="favorite-link">
                <span className="favorite-symbol">{fav.symbol}</span>
                <span className="favorite-name">{fav.name}</span>
              </Link>
              <button
                className="favorite-remove"
                onClick={() => handleRemoveFavorite(fav.symbol)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="profile-section-title">Alerts</h2>

      <button className="check-alerts-button" onClick={handleCheckAlerts}>
        Check Alerts
      </button>

      {alerts.length === 0 ? (
        <div className="profile-empty">
          <p>No alerts yet</p>
          <p className="profile-hint">Click "Check Alerts" to check your favorites for signals</p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map(alert => (
            <div key={alert.id} className={`alert-item alert-${alert.alert_type.toLowerCase()}`}>
              <div className="alert-header">
                <span className="alert-symbol">{alert.symbol}</span>
                <span className={`alert-type ${alert.alert_type === 'B' ? 'bullish' : 'bearish'}`}>
                  {alert.alert_type === 'B' ? 'BUY' : 'SELL'}
                </span>
              </div>
              <div className="alert-details">
                <div className="alert-row">
                  <span className="alert-label">Current:</span>
                  <span className="alert-value">${alert.price.toFixed(2)}</span>
                </div>
                {alert.entry_price && (
                  <div className="alert-row">
                    <span className="alert-label">Entry:</span>
                    <span className="alert-value">${alert.entry_price.toFixed(2)}</span>
                  </div>
                )}
                {alert.stop_loss && (
                  <div className="alert-row">
                    <span className="alert-label">Stop Loss:</span>
                    <span className="alert-value alert-sl">${alert.stop_loss.toFixed(2)}</span>
                  </div>
                )}
                {alert.take_profit && (
                  <div className="alert-row">
                    <span className="alert-label">Take Profit:</span>
                    <span className="alert-value alert-tp">${alert.take_profit.toFixed(2)}</span>
                  </div>
                )}
                {alert.atr && (
                  <div className="alert-row">
                    <span className="alert-label">ATR:</span>
                    <span className="alert-value">${alert.atr.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <span className="alert-time">
                {new Date(alert.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <button className="logout-button" onClick={handleLogout}>
        Sign Out
      </button>
    </div>
  );
}