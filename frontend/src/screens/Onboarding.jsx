import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/onboarding.css';

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'pcm', label: 'Pidgin' },
  { id: 'yo', label: 'Yoruba' },
  { id: 'ig', label: 'Igbo' },
  { id: 'ha', label: 'Hausa' },
];

const EXPENSE_CATEGORIES = ['bills', 'lifestyle', 'transport', 'shopping', 'other'];

const TRUST_POINTS = [
  'Speak in English, Yoruba, Igbo, Hausa or Pidgin',
  'See exactly how many days your balance covers',
  'No bank connection — nothing to sync, nothing to hack',
];

const PROOF_BARS = [
  { label: 'Rent', pct: 62, color: '#F3F06F' },
  { label: 'Transport', pct: 34, color: '#6FE3D9' },
];

const TRUST_BADGES = [
  { icon: LockIcon, label: 'Bank-grade encryption' },
  { icon: ShieldIcon, label: 'PIN-locked diary' },
  { icon: EyeIcon, label: 'No bank login, ever' },
];

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OnboardingBrandPanel() {
  return (
    <aside className="onboarding-brand">
      <div className="onboarding-brand-eyebrow">Zuri</div>
      <h2 className="onboarding-brand-heading">
        Set up your money diary <span className="accent">in under a minute.</span>
      </h2>
      <p className="onboarding-brand-sub">
        Voice-native, PIN-locked, and yours alone — no forms to dig through, no bank connection, no catch.
      </p>
      <ul className="onboarding-brand-points">
        {TRUST_POINTS.map((p) => (
          <li key={p}>
            <span className="dot" />
            {p}
          </li>
        ))}
      </ul>

      <div className="onboarding-proof-card">
        <div className="onboarding-proof-top">
          <span className="onboarding-proof-label">Diary balance</span>
          <span className="onboarding-proof-live">● live demo</span>
        </div>
        <div className="onboarding-proof-amount">₦184,300</div>
        <div className="onboarding-proof-bars">
          {PROOF_BARS.map((b) => (
            <div className="onboarding-proof-bar-row" key={b.label}>
              <span>{b.label}</span>
              <div className="onboarding-proof-bar-track">
                <div
                  className="onboarding-proof-bar-fill"
                  style={{ width: `${b.pct}%`, background: b.color }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="onboarding-proof-msg">
          <strong>Zuri:</strong> Netflix charged you again — that's 3 months running, ₦3,900 each time.
        </div>
      </div>

      <div className="onboarding-brand-badges">
        {TRUST_BADGES.map(({ icon: Icon, label }) => (
          <div className="onboarding-brand-badge" key={label}>
            <Icon />
            {label}
          </div>
        ))}
      </div>
    </aside>
  );
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/rent|light|electric|water|dstv|gotv|internet|wifi/.test(n)) return 'bills';
  if (/netflix|spotify|showmax|subscri/.test(n)) return 'lifestyle';
  if (/transport|fuel|uber|bolt|bus/.test(n)) return 'transport';
  return 'other';
}

export default function Onboarding() {
  const { signup, login, token, refreshAccount } = useAuth();
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
  const [startingBalance, setStartingBalance] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [expenses, setExpenses] = useState([{ name: '', amount: '' }]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pressPin(d) {
    if (form.pin.length >= 4) return;
    set('pin', form.pin + d);
  }

  function updateExpense(i, field, value) {
    setExpenses((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addExpenseRow() {
    if (expenses.length >= 3) return;
    setExpenses((rows) => [...rows, { name: '', amount: '' }]);
  }

  function removeExpenseRow(i) {
    setExpenses((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function finishSetup() {
    setBusy(true);
    try {
      const recurring_expenses = expenses
        .filter((e) => e.name.trim() && Number(e.amount) > 0)
        .map((e) => ({
          name: e.name.trim(),
          amount_kobo: Math.round(Number(e.amount) * 100),
          category: guessCategory(e.name),
        }));
      await api.onboardingSetup(token, {
        starting_balance_kobo: Math.round((Number(startingBalance) || 0) * 100),
        monthly_income_kobo: Math.round((Number(monthlyIncome) || 0) * 100),
        recurring_expenses,
      });
      await refreshAccount();
    } catch {
      /* onboarding setup is best-effort — don't block entry to the app */
    } finally {
      navigate('/dashboard', { replace: true });
    }
  }

  async function submitSignup() {
    setBusy(true);
    setError('');
    try {
      await signup(form);
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
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
      set('pin', '');
    } finally {
      setBusy(false);
    }
  }

  const totalSteps = mode === 'signup' ? 3 : 2;

  return (
    <div className="onboarding-wrap">
      <div className="onboarding-grid">
        <OnboardingBrandPanel />
        <div className="onboarding-card-col">
          {step > 0 && (
            <div className="onboarding-progress">
              <div className="onboarding-progress-track">
                <div className="onboarding-progress-fill" style={{ width: `${(step / totalSteps) * 100}%` }} />
              </div>
              <span className="onboarding-progress-label">Step {step} of {totalSteps}</span>
            </div>
          )}
          <div className="onboarding-card" key={step}>
        {step > 0 && (
          <button type="button" className="onboarding-back" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
        )}
        {step === 0 && (
          <Link to="/" className="onboarding-back">← Back</Link>
        )}

        {step === 0 && (
          <>
            <div className="onboarding-eyebrow">Zuri</div>
            <p className="onboarding-sub" style={{ marginTop: 10 }}>
              Tell Zuri what's in your pocket. It'll tell you where it's going — by voice, in
              English, Pidgin, Yoruba, Igbo or Hausa.
            </p>
            <button type="button" className="onboarding-btn onboarding-btn-primary" onClick={() => { setMode('signup'); setStep(1); setError(''); }}>
              Start my money diary
            </button>
            <div className="onboarding-btn-row">
              <button type="button" className="onboarding-btn onboarding-btn-secondary" onClick={() => { setMode('login'); setStep(1); setError(''); }}>
                I already have one
              </button>
            </div>
          </>
        )}

        {step === 1 && mode === 'signup' && (
          <>
            <h1 className="onboarding-title">Who are you?</h1>
            <p className="onboarding-sub">
              No bank connection needed — Zuri only ever knows what you tell it.
            </p>
            <div className="onboarding-field">
              <label>Full name</label>
              <input className="onboarding-input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Your full name" />
            </div>
            <div className="onboarding-field">
              <label>Phone</label>
              <input className="onboarding-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08012345678" />
            </div>
            <div className="onboarding-field">
              <label>Email</label>
              <input className="onboarding-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" />
            </div>
            <div className="onboarding-field">
              <label>Password</label>
              <div className="onboarding-password-wrap">
                <input
                  className="onboarding-input"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  className="onboarding-password-eye"
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
            <div className="onboarding-field">
              <label>Language</label>
              <div className="onboarding-chip-row">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`onboarding-chip${form.language_pref === l.id ? ' active' : ''}`}
                    onClick={() => set('language_pref', l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary"
              disabled={!form.full_name || !form.phone || !form.email || form.password.length < 8}
              onClick={() => setStep(2)}
            >
              Set my PIN
            </button>
          </>
        )}

        {step === 1 && mode === 'login' && (
          <>
            <h1 className="onboarding-title">Welcome back</h1>
            <p className="onboarding-sub">Phone + 4-digit PIN.</p>
            <div className="onboarding-field">
              <label>Phone</label>
              <input className="onboarding-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08012345678" />
            </div>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary"
              disabled={form.phone.length < 10}
              onClick={() => setStep(2)}
            >
              Enter PIN
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="onboarding-title">{mode === 'signup' ? 'Set a PIN' : 'Enter PIN'}</h1>
            <p className="onboarding-sub">Never shared with the AI. Just yours.</p>
            <div className="onboarding-pin-dots">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`onboarding-pin-dot${form.pin.length > i ? ' filled' : ''}`} />
              ))}
            </div>
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-pin-pad">
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
              className="onboarding-btn onboarding-btn-primary"
              disabled={form.pin.length !== 4 || busy}
              onClick={mode === 'signup' ? submitSignup : submitLogin}
            >
              {busy ? 'Working…' : mode === 'signup' ? 'Continue' : 'Log in'}
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="onboarding-title">Set the scene</h1>
            <p className="onboarding-sub">
              A few real numbers so Zuri has something to reason about from day one.
            </p>
            <div className="onboarding-field">
              <label>About how much do you have right now?</label>
              <input
                className="onboarding-input"
                inputMode="decimal"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="₦0"
              />
            </div>
            <div className="onboarding-field">
              <label>Roughly what's your monthly income? (optional)</label>
              <input
                className="onboarding-input"
                inputMode="decimal"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="₦0"
              />
            </div>
            <div className="onboarding-field">
              <label>Any regular payments? (rent, subscriptions, transport)</label>
            </div>
            {expenses.map((row, i) => (
              <div className="onboarding-scene-row" key={i}>
                <div className="onboarding-field">
                  <input
                    className="onboarding-input"
                    value={row.name}
                    onChange={(e) => updateExpense(i, 'name', e.target.value)}
                    placeholder="e.g. Rent"
                  />
                </div>
                <div className="onboarding-field">
                  <input
                    className="onboarding-input"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateExpense(i, 'amount', e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="₦0"
                  />
                </div>
                {expenses.length > 1 && (
                  <button type="button" className="onboarding-remove-row" onClick={() => removeExpenseRow(i)} aria-label="Remove">
                    ×
                  </button>
                )}
              </div>
            ))}
            {expenses.length < 3 && (
              <button type="button" className="onboarding-add-row" onClick={addExpenseRow}>
                + Add another
              </button>
            )}
            <button type="button" className="onboarding-btn onboarding-btn-primary" disabled={busy} onClick={finishSetup}>
              {busy ? 'Setting up…' : 'Open my diary'}
            </button>
            <button type="button" className="onboarding-skip" onClick={finishSetup}>
              Skip — I'll log things as they happen
            </button>
          </>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
