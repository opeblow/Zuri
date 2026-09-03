import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';

/**
 * Two-step beneficiary flow:
 *  1. Enter account_number + bank_code → resolve name
 *  2. Confirm the resolved name + enter nickname → save
 */
export default function Beneficiaries() {
  const { token } = useAuth();
  const [people, setPeople] = useState([]);
  const [banks, setBanks] = useState([]);
  const [open, setOpen] = useState(false);

  /* Step 1 state */
  const [form, setForm] = useState({ account_number: '', bank_code: '058' });
  const [resolving, setResolving] = useState(false);

  /* Step 2 state (populated after resolve) */
  const [resolved, setResolved] = useState(null);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    const [b, banksRes] = await Promise.all([api.beneficiaries(token), api.banks()]);
    setPeople(b.beneficiaries || []);
    setBanks(banksRes.banks || []);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({ account_number: '', bank_code: '058' });
    setResolved(null);
    setNickname('');
    setError('');
  }

  function toggleOpen() {
    setOpen((v) => !v);
    resetForm();
    setSuccessMsg('');
  }

  /** Step 1 — resolve account name */
  async function handleResolve(e) {
    e.preventDefault();
    if (form.account_number.length !== 10) {
      setError('Account number must be 10 digits');
      return;
    }
    setResolving(true);
    setError('');
    try {
      const data = await api.resolveBeneficiary(token, {
        account_number: form.account_number,
        bank_code: form.bank_code,
      });
      setResolved(data);
    } catch (err) {
      setError(err.message || 'Could not resolve account');
    } finally {
      setResolving(false);
    }
  }

  /** Step 2 — confirm & save */
  async function handleSave(e) {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.addBeneficiary(token, {
        nickname: nickname.trim(),
        account_number: resolved.account_number,
        bank_code: resolved.bank_code,
      });
      setSuccessMsg(`${resolved.account_name} saved as "${nickname.trim()}"`);
      resetForm();
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save beneficiary');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <h1>People</h1>
      <p className="lede">Voice can only send to people you've saved here.</p>
      <button
        type="button"
        className="btn btn-ink"
        style={{ width: '100%', marginBottom: 16 }}
        onClick={toggleOpen}
      >
        {open ? 'Close' : 'Add someone'}
      </button>

      {open && !resolved && (
        <form className="row-card" onSubmit={handleResolve} style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Account number</label>
            <input
              value={form.account_number}
              onChange={(e) =>
                setForm({ ...form, account_number: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              placeholder="0123456789"
              maxLength={10}
              inputMode="numeric"
              required
            />
          </div>
          <div className="field">
            <label>Bank</label>
            <select
              value={form.bank_code}
              onChange={(e) => setForm({ ...form, bank_code: e.target.value })}
            >
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={resolving}
          >
            {resolving ? 'Resolving…' : 'Resolve account'}
          </button>
        </form>
      )}

      {open && resolved && (
        <form className="row-card" onSubmit={handleSave} style={{ marginBottom: 16 }}>
          <div
            className="resolved-name-banner"
            style={{
              background: 'var(--mint)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.85rem',
                color: 'var(--muted)',
                marginBottom: 4,
              }}
            >
              Account resolved as
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              {resolved.account_name}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {resolved.account_number} · {resolved.bank_name}
            </p>
          </div>

          <div className="field">
            <label>Nickname for this person</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Mummy"
              maxLength={40}
              required
              autoFocus
            />
          </div>

          {error && <p className="error">{error}</p>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-soft"
              style={{ flex: 1 }}
              onClick={resetForm}
              disabled={saving}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Confirm & save'}
            </button>
          </div>
        </form>
      )}

      {successMsg && (
        <p className="success" style={{ marginBottom: 12 }}>
          ✓ {successMsg}
        </p>
      )}

      <div className="list">
        {people.map((p) => (
          <article key={p.id} className="row-card">
            <div className="row-split">
              <h3>{p.nickname}</h3>
              <span className="cat-chip">{p.bank_name}</span>
            </div>
            <p>{p.full_name}</p>
            <p style={{ marginTop: 4 }}>
              {p.account_number} · sent {p.send_count}×
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
