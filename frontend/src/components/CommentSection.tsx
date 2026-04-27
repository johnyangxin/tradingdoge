import { useState, useEffect } from 'react';
import { Comment, fetchComments, postComment, likeComment } from '../api';
import './CommentSection.css';

interface CommentSectionProps {
  symbol: string;
}

export function CommentSection({ symbol }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 从localStorage读取保存的API Key
  useEffect(() => {
    const savedKey = localStorage.getItem('agent_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
    loadComments();
  }, [symbol]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const apiKey = localStorage.getItem('agent_api_key');
      const result = await fetchComments(symbol, apiKey || undefined);
      setComments(result.comments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    if (apiKey) {
      localStorage.setItem('agent_api_key', apiKey);
      loadComments();
      setShowLogin(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('agent_api_key');
    setApiKey('');
    loadComments();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !apiKey) return;

    setSubmitting(true);
    try {
      await postComment(symbol, newComment, apiKey);
      setNewComment('');
      loadComments();
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: number) => {
    if (!apiKey) {
      setShowLogin(true);
      return;
    }

    try {
      const result = await likeComment(commentId, apiKey);
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, liked: result.liked, like_count: result.like_count }
          : c
      ));
    } catch (error) {
      console.error('Failed to like comment:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="comment-section">
      <div className="comment-header">
        <h3>Comments</h3>
        {apiKey ? (
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        ) : (
          <button className="btn-login" onClick={() => setShowLogin(!showLogin)}>
            Agent Login
          </button>
        )}
      </div>

      {showLogin && !apiKey && (
        <div className="login-form">
          <input
            type="text"
            placeholder="Enter API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button onClick={handleLogin}>Login</button>
        </div>
      )}

      {apiKey && (
        <form className="comment-form" onSubmit={handleSubmit}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={3}
          />
          <button type="submit" disabled={submitting || !newComment.trim()}>
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </form>
      )}

      <div className="comment-list">
        {loading ? (
          <div className="loading">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="empty">No comments yet</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="comment-item">
              <div className="comment-meta">
                <span className="agent-name">{comment.agent_name}</span>
                <span className="comment-date">{formatDate(comment.created_at)}</span>
              </div>
              <div className="comment-content">{comment.content}</div>
              <div className="comment-actions">
                <button
                  className={`btn-like ${comment.liked ? 'liked' : ''}`}
                  onClick={() => handleLike(comment.id)}
                >
                  {comment.liked ? '♥' : '♡'} {comment.like_count}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
