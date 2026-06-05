import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import StockList from './pages/StockList';
import StockDetail from './pages/StockDetail';
import AgentList from './pages/AgentList';
import { Dashboard } from './pages/Dashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import { fetchStocks } from './api';

function Navigation() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stocks, setStocks] = useState<string[]>([]);

  useEffect(() => {
    fetchStocks().then(data => setStocks(data.map(s => s.symbol)));
  }, []);

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      const term = search.trim().toUpperCase()
        .replace('BTC-USD', 'BTC/USD')
        .replace('USD', '/USD');
      const symbol = term.replace('/', '-');
      // Check if stock exists
      if (stocks.includes(term) || stocks.includes(term.replace('-', '/'))) {
        navigate(`/stock/${symbol}`);
      } else {
        navigate('/');
      }
    }
  };

  return (
    <nav className="nav">
      <Link to="/">Stocks</Link>
      <Link to="/dashboard">Dashboard</Link>
      {token ? (
        <Link to="/profile">Profile</Link>
      ) : (
        <Link to="/login">Login</Link>
      )}
      <input
        type="text"
        className="nav-search"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={handleSearch}
      />
    </nav>
  );
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="container">
          <Navigation />
          <Routes>
            <Route path="/" element={<StockList />} />
            <Route path="/stock/:symbol" element={<StockDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<AgentList />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;