import { useState } from 'react';
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
  const { user, logout, token, setUser } = useAuth();
  const navigate = useNavigate();
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

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

  async function handleResetDemo() {
    if (resetBusy || !token) return;
    setResetBusy(true);
    setResetError('');
    try {
      await api.resetDemo(token);
      logout();
      navigate('/');
    } catch (err) {
      setResetError(err.message || 'Could not reset demo data.');
      setResetBusy(false);
    }
  }

  const name = user?.full_name || 'Account';
  const phone = user?.phone || '';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Language and account basics.</p>
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
            <h2 className="settings-card-title">Demo</h2>
          </div>
          <p className="settings-detail-label" style={{ marginBottom: 10 }}>
            Wipe every logged entry, goal, and this account, and start fresh.
          </p>
          {resetError && <p className="error">{resetError}</p>}
          <button type="button" className="settings-logout-btn" onClick={handleResetDemo} disabled={resetBusy}>
            {resetBusy ? 'Resetting…' : 'Reset demo data'}
          </button>
        </div>

        <button type="button" className="settings-logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
