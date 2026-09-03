import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function Goals() {
  const { token } = useAuth();
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    api.goals(token).then((d) => setGoals(d.goals || []));
  }, [token]);

  async function pause(id, status) {
    await api.patchGoal(token, id, { status });
    const d = await api.goals(token);
    setGoals(d.goals || []);
  }

  return (
    <div className="panel">
      <h1>Goals</h1>
      <p className="lede">Mostly view-only — create new goals by talking to Zuri on Home.</p>
      <div className="list">
        {goals.map((g) => (
          <article key={g.id} className="row-card">
            <div className="row-split">
              <h3>{g.name}</h3>
              <span className="cat-chip">{g.status}</span>
            </div>
            <p>
              {g.current_display} of {g.target_display} · due {g.target_date}
            </p>
            <p style={{ marginTop: 4 }}>Monthly {g.recurring_display}</p>
            <div className="progress" aria-hidden>
              <span style={{ width: `${g.progress_pct}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {g.status === 'active' ? (
                <button type="button" className="btn btn-soft" onClick={() => pause(g.id, 'paused')}>
                  Pause
                </button>
              ) : (
                <button type="button" className="btn btn-soft" onClick={() => pause(g.id, 'active')}>
                  Resume
                </button>
              )}
            </div>
          </article>
        ))}
        {!goals.length && <p className="empty">No goals yet. Ask Zuri about your rent.</p>}
      </div>
    </div>
  );
}
