import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchFavorites, addFavorite, removeFavorite } from '../api';

interface Props {
  symbol: string;
}

export const FavoriteButton: React.FC<Props> = ({ symbol }) => {
  const { token } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchFavorites(token).then(data => {
      const symbols = (data.favorites || []).map((f: any) => f.symbol || f);
      setFavorited(symbols.includes(symbol));
    }).catch(() => {});
  }, [token, symbol]);

  const toggleFavorite = async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (favorited) {
        await removeFavorite(symbol, token);
        setFavorited(false);
      } else {
        await addFavorite(symbol, token);
        setFavorited(true);
      }
    } catch (e) {
      console.error('Favorite error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="favorite-section">
        <Link to="/login" className="login-favorite-btn">
          Login to favorite
        </Link>
      </div>
    );
  }

  return (
    <div className="favorite-section">
      <button
        className={`favorite-btn ${favorited ? 'favorited' : ''}`}
        onClick={toggleFavorite}
        disabled={loading}
      >
        {favorited ? '★' : '☆'} Favorite
      </button>
    </div>
  );
};