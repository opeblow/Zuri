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

  async function selectLanguage(langId) {
    setUser({ ...user, language_pref: langId });
    try {
      await api.updateProfile(token, { language_pref: langId });
    } catch (err) {
      console.error('Failed to save language preference:', err);
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  const name = user?.full_name || 'Account';
  const phone = user?.phone || '';
  const initial = name.charAt(0).toUpperCase();
  const accountNumber = account?.account_number || account?.reserved_account || '—';
  const bankName = 'Zuri';

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Language, limits, and account basics.</p>
      </div>

      <div className="settings-content">
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Profile</h2>
          </div>
          <div className="settings-profile">
            <div className="settings-avatar">{initial}</div>
            <div className="settings-profile-info">
              <span className="settings-profile-name">{name}</span>
              {phone && <span className="settings-profile-phone">{phone}</span>}
            </div>
          </div>
          <div className="settings-detail-rows">
            <div className="settings-detail-row">
              <span className="settings-detail-label">Full name</span>
              <span className="settings-detail-value">{name}</span>
            </div>
            {accountNumber && accountNumber !== '—' && (
              <div className="settings-detail-row">
                <span className="settings-detail-label">Account number</span>
                <span className="settings-detail-value settings-detail-mono">{accountNumber}</span>
              </div>
            )}
            {bankName && (
              <div className="settings-detail-row">
                <span className="settings-detail-label">Bank</span>
                <span className="settings-detail-value">{bankName}</span>
              </div>
            )}
            <div className="settings-detail-row">
              <span className="settings-detail-label">Security PIN</span>
              <span className="settings-detail-value">••••</span>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Language</h2>
            <span className="settings-card-meta">Current: {getLanguageLabel(user?.language_pref)}</span>
          </div>
          <div className="settings-lang-grid">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`settings-lang-btn${user?.language_pref === l.id ? ' active' : ''}`}
                onClick={() => selectLanguage(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Security</h2>
          </div>
          <div className="settings-detail-rows">
            <div className="settings-detail-row">
              <span className="settings-detail-label">Biometric daily limit</span>
              <span className="settings-detail-value">
                ₦{((user?.daily_biometric_limit_kobo || 2_000_000) / 100).toLocaleString()}
              </span>
            </div>
            <div className="settings-detail-row">
              <span className="settings-detail-label">PIN required above</span>
              <span className="settings-detail-value">Larger sends</span>
            </div>
          </div>
        </div>

        <button type="button" className="settings-logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
