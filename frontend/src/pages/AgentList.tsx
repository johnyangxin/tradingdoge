import { useState, useEffect } from 'react';
import { Agent, fetchAgentList } from '../api';

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const result = await fetchAgentList();
      setAgents(result.agents);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  return (
    <div className="agent-list-page">
      <h1>Registered Agents</h1>
      {loading ? (
        <div className="loading">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="empty">No agents registered yet</div>
      ) : (
        <div className="agent-grid">
          {agents.map(agent => (
            <div key={agent.id} className="agent-card">
              <div className="agent-name">{agent.name}</div>
              <div className="agent-info">
                <span>ID: {agent.id}</span>
                <span>Joined: {formatDate(agent.created_at)}</span>
              </div>
              {agent.notify_enabled ? (
                <div className="agent-notify">
                  🔔 {agent.notify_type === 'telegram' ? 'Telegram' : 'Feishu'}
                </div>
              ) : (
                <div className="agent-notify">🔕 No notifications</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
