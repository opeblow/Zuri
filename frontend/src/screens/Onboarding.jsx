import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'pcm', label: 'Pidgin' },
  { id: 'yo', label: 'Yoruba' },
  { id: 'ig', label: 'Igbo' },
  { id: 'ha', label: 'Hausa' },
];

export default function Onboarding() {
  const { signup, login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('signup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    language_pref: 'en',
    pin: '',
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pressPin(d) {
    if (form.pin.length >= 4) return;
    const pin = form.pin + d;
    set('pin', pin);
  }

  async function submitSignup() {
    setBusy(true);
    setError('');
    try {
      const data = await signup(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin() {
    setBusy(true);
    setError('');
    try {
      await login(form.phone, form.pin);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
      set('pin', '');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone onboarding-screen">
      <div className="panel onboarding-panel">
        <Link to="/" style={{ color: 'var(--muted)', fontWeight: 600, fontSize: '0.85rem' }}>
          ← Back
        </Link>

        {step === 0 && (
          <div className="onboarding-intro">
            <h1 style={{ marginTop: 18 }}>Zuri</h1>
            <p className="lede">Talk to your money. It talks back — in English, Pidgin, or Yoruba.</p>
            <button type="button" className="btn btn-ink" style={{ width: '100%', marginBottom: 10 }} onClick={() => { setMode('signup'); setStep(1); setError(''); }}>
              Create account
            </button>
            <button type="button" className="btn btn-soft" style={{ width: '100%' }} onClick={() => { setMode('login'); setStep(1); setError(''); }}>
              I already have one
            </button>
          </div>
        )}

        {step === 1 && mode === 'signup' && (
          <>
            <h1 style={{ marginTop: 18 }}>Who are you?</h1>
            <p className="lede">We'll provide a Monnify reserved account behind the scenes.</p>
            <div className="field">
              <label>Full name</label>
              <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Your full name" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08012345678" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  className="password-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Language</p>
            <div className="chip-row">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`chip${form.language_pref === l.id ? ' active' : ''}`}
                  onClick={() => set('language_pref', l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ink"
              style={{ width: '100%' }}
              disabled={!form.full_name || !form.phone || !form.email || form.password.length < 8}
              onClick={() => setStep(2)}
            >
              Set my PIN
            </button>
          </>
        )}

        {step === 1 && mode === 'login' && (
          <>
            <h1 style={{ marginTop: 18 }}>Welcome back</h1>
            <p className="lede">Phone + 4-digit PIN.</p>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08012345678" />
            </div>
            <button
              type="button"
              className="btn btn-ink"
              style={{ width: '100%' }}
              disabled={form.phone.length < 10}
              onClick={() => setStep(2)}
            >
              Enter PIN
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ marginTop: 18 }}>{mode === 'signup' ? 'Set a PIN' : 'Enter PIN'}</h1>
            <p className="lede">Every money move needs this. Never shared with the AI.</p>
            <div className="pin-dots">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`pin-dot${form.pin.length > i ? ' filled' : ''}`} />
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="pin-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) => {
                if (!key) return <span key={idx} />;
                if (key === '⌫')
                  return (
                    <button key={key} type="button" onClick={() => set('pin', form.pin.slice(0, -1))}>
                      ⌫
                    </button>
                  );
                return (
                  <button key={key} type="button" onClick={() => pressPin(key)}>
                    {key}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="btn btn-ink"
              style={{ width: '100%', marginTop: 16 }}
              disabled={form.pin.length !== 4 || busy}
              onClick={mode === 'signup' ? submitSignup : submitLogin}
            >
              {busy ? 'Working…' : mode === 'signup' ? 'Create Zuri account' : 'Log in'}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
