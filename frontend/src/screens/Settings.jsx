import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const { user, account, logout, token, setUser } = useAuth();
  const navigate = useNavigate();

  async function resetDemo() {
    await api.resetDemo();
    logout();
    navigate('/');
  }

  return (
    <div className="panel">
      <h1>You</h1>
      <p className="lede">Language, limits, and account basics.</p>

      <div className="row-card" style={{ marginBottom: 12 }}>
        <h3>{user?.full_name}</h3>
        <p>{user?.phone}</p>
        <p style={{ marginTop: 8 }}>
          Reserved: <strong>{account?.reserved_account}</strong> · {account?.bank_name}
        </p>
      </div>

      <div className="row-card" style={{ marginBottom: 12 }}>
        <h3>Language</h3>
        <p className="lede" style={{ marginBottom: 10 }}>
          Pref: {user?.language_pref}
        </p>
        <div className="chip-row">
          {['en', 'pcm', 'yo'].map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${user?.language_pref === l ? ' active' : ''}`}
              onClick={() => setUser({ ...user, language_pref: l })}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="row-card" style={{ marginBottom: 12 }}>
        <h3>Biometric daily limit</h3>
        <p>₦{((user?.daily_biometric_limit_kobo || 2_000_000) / 100).toLocaleString()} — larger sends always need PIN.</p>
      </div>

      <button type="button" className="btn btn-soft" style={{ width: '100%', marginBottom: 10 }} onClick={resetDemo}>
        Reset demo data
      </button>
      <button
        type="button"
        className="btn btn-ink"
        style={{ width: '100%' }}
        onClick={() => {
          logout();
          navigate('/');
        }}
      >
        Log out
      </button>
    </div>
  );
}
