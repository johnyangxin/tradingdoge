import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import StockList from './pages/StockList';
import StockDetail from './pages/StockDetail';
import AgentList from './pages/AgentList';
import { Dashboard } from './pages/Dashboard';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="container">
        <nav className="nav">
          <Link to="/">Stocks</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/agents">Agents</Link>
        </nav>
        <Routes>
          <Route path="/" element={<StockList />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agents" element={<AgentList />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;