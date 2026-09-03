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
  const { signup, login, account } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('signup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    language_pref: 'en',
    pin: '',
  });
  const [readyAccount, setReadyAccount] = useState(null);

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
      setReadyAccount(data.account);
      setStep(3);
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
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Login failed');
      set('pin', '');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone">
      <div className="panel">
        <Link to="/" style={{ color: 'var(--muted)', fontWeight: 600, fontSize: '0.85rem' }}>
          ← Back
        </Link>

        {step === 0 && (
          <>
            <h1 style={{ marginTop: 18 }}>Zuri</h1>
            <p className="lede">Talk to your money. It talks back — in English, Pidgin, or Yoruba.</p>
            <button type="button" className="btn btn-ink" style={{ width: '100%', marginBottom: 10 }} onClick={() => { setMode('signup'); setStep(1); }}>
              Create account
            </button>
            <button type="button" className="btn btn-soft" style={{ width: '100%' }} onClick={() => { setMode('login'); setStep(1); }}>
              I already have one
            </button>
          </>
        )}

        {step === 1 && mode === 'signup' && (
          <>
            <h1 style={{ marginTop: 18 }}>Who are you?</h1>
            <p className="lede">We'll provision a Monnify reserved account behind the scenes.</p>
            <div className="field">
              <label>Full name</label>
              <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Amina Okonkwo" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08012345678" />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" />
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
              disabled={!form.full_name || !form.phone || !form.email}
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

        {step === 3 && (
          <>
            <h1 style={{ marginTop: 18 }}>You're ready</h1>
            <p className="lede">Your Zuri account is live. Fund it from any bank to start talking.</p>
            <div className="row-card">
              <p style={{ marginBottom: 4 }}>Reserved account</p>
              <h3 style={{ fontSize: '1.4rem', letterSpacing: '0.04em' }}>
                {readyAccount?.reserved_account || account?.reserved_account}
              </h3>
              <p>{readyAccount?.bank_name || account?.bank_name}</p>
              <button
                type="button"
                className="btn btn-soft"
                style={{ marginTop: 12, width: '100%' }}
                onClick={() =>
                  navigator.clipboard?.writeText(readyAccount?.reserved_account || account?.reserved_account || '')
                }
              >
                Copy account number
              </button>
            </div>
            <button type="button" className="btn btn-ink" style={{ width: '100%', marginTop: 16 }} onClick={() => navigate('/app')}>
              Start talking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
