import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function Beneficiaries() {
  const { token } = useAuth();
  const [people, setPeople] = useState([]);
  const [banks, setBanks] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nickname: '', account_number: '', bank_code: '058' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [b, banksRes] = await Promise.all([api.beneficiaries(token), api.banks()]);
    setPeople(b.beneficiaries || []);
    setBanks(banksRes.banks || []);
  }

  useEffect(() => {
    load();
  }, [token]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.addBeneficiary(token, form);
      setPreview(data.verification);
      setOpen(false);
      setForm({ nickname: '', account_number: '', bank_code: '058' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not verify account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h1>People</h1>
      <p className="lede">Voice can only send to people you've saved here.</p>
      <button type="button" className="btn btn-ink" style={{ width: '100%', marginBottom: 16 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Close' : 'Add someone'}
      </button>

      {open && (
        <form className="row-card" onSubmit={save} style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Nickname</label>
            <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="Mummy" required />
          </div>
          <div className="field">
            <label>Account number</label>
            <input
              value={form.account_number}
              onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              placeholder="0123456789"
              maxLength={10}
              required
            />
          </div>
          <div className="field">
            <label>Bank</label>
            <select value={form.bank_code} onChange={(e) => setForm({ ...form, bank_code: e.target.value })}>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Verifying with Monnify…' : 'Verify & save'}
          </button>
        </form>
      )}

      {preview && (
        <p className="success" style={{ marginBottom: 12 }}>
          Verified as {preview.accountName}
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
