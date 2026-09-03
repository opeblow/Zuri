import { useAuth } from '../state/AuthContext.jsx';
import { api, getLanguageLabel } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'pcm', label: 'Pidgin' },
  { id: 'yo', label: 'Yoruba' },
  { id: 'ig', label: 'Igbo' },
  { id: 'ha', label: 'Hausa' },
];

export default function Settings() {
  const { user, account, logout, token, setUser } = useAuth();
  const navigate = useNavigate();

  async function resetDemo() {
    await api.resetDemo();
    logout();
    navigate('/');
  }

  async function selectLanguage(langId) {
    setUser({ ...user, language_pref: langId });
    try {
      await api.updateProfile(token, { language_pref: langId });
    } catch (err) {
      console.error('Failed to save language preference:', err);
    }
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
          Pref: {getLanguageLabel(user?.language_pref)}
        </p>
        <div className="chip-row">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`chip${user?.language_pref === l.id ? ' active' : ''}`}
              onClick={() => selectLanguage(l.id)}
            >
              {l.label}
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
