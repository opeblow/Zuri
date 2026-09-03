import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira } from '../lib/api.js';

export default function History() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.transactions(token).then((d) => setRows(d.transactions || []));
  }, [token]);

  return (
    <div className="panel">
      <h1>Activity</h1>
      <p className="lede">Every move, with an AI-assigned category.</p>
      <div className="list">
        {rows.map((t) => (
          <article key={t.id} className="row-card">
            <div className="row-split">
              <h3>{t.counterparty_name}</h3>
              <span className={t.direction === 'inbound' ? 'amount-in' : 'amount-out'}>
                {t.direction === 'inbound' ? '+' : '−'}
                {formatNaira(t.amount_kobo)}
              </span>
            </div>
            <p>{t.narration}</p>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cat-chip">{t.category}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                {new Date(t.occurred_at).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </div>
          </article>
        ))}
        {!rows.length && <p className="empty">No transactions yet.</p>}
      </div>
    </div>
  );
}
