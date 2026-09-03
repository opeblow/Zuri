import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';

const DEMO_BANKS = [
  { code: '058', name: 'GTBank' },
  { code: '044', name: 'Access Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '011', name: 'First Bank' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '030', name: 'Heritage Bank' },
  { code: '032', name: 'Union Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' },
];

function maskAccount(num) {
  if (!num) return '••••••••••';
  const last4 = num.slice(-4);
  return '••••••' + last4;
}

function getInitial(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name) {
  const colors = ['#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95', '#8B5CF6'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Beneficiaries() {
  const { token } = useAuth();
  const [people, setPeople] = useState([]);
  const [banks, setBanks] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);

  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ account_number: '', bank_code: '058' });
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setPeople([]);
      setBanks(DEMO_BANKS);
      return;
    }
    try {
      const [b, banksRes] = await Promise.all([api.beneficiaries(token), api.banks()]);
      const raw = b.beneficiaries || [];
      setPeople(raw);
      setBanks((banksRes.banks || []).length ? banksRes.banks : DEMO_BANKS);
    } catch {
      setPeople([]);
      setBanks(DEMO_BANKS);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null);
      }
    }
    if (menuOpen !== null) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [menuOpen]);

  function openPanel() {
    setPanelOpen(true);
    setStep('form');
    setForm({ account_number: '', bank_code: '058' });
    setResolved(null);
    setNickname('');
    setError('');
    setSuccessMsg('');
  }

  function closePanel() {
    setPanelOpen(false);
    setStep('form');
    setForm({ account_number: '', bank_code: '058' });
    setResolved(null);
    setNickname('');
    setError('');
  }

  async function handleResolve(e) {
    e.preventDefault();
    if (form.account_number.length !== 10) {
      setError('Account number must be 10 digits');
      return;
    }
    setResolving(true);
    setError('');
    try {
      if (token) {
        const data = await api.resolveBeneficiary(token, {
          account_number: form.account_number,
          bank_code: form.bank_code,
        });
        setResolved(data);
      } else {
        const bankName = banks.find((b) => b.code === form.bank_code)?.name || 'Unknown Bank';
        setResolved({
          account_name: 'Resolved Account Name',
          account_number: form.account_number,
          bank_code: form.bank_code,
          bank_name: bankName,
        });
      }
      setStep('verified');
    } catch (err) {
      setError(err.message || 'Could not resolve account');
    } finally {
      setResolving(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (token) {
        await api.addBeneficiary(token, {
          nickname: nickname.trim(),
          full_name: resolved.account_name,
          account_number: resolved.account_number,
          bank_code: resolved.bank_code,
        });
      }
      setSuccessMsg(`${resolved.account_name} saved as "${nickname.trim()}"`);
      await load();
      closePanel();
    } catch (err) {
      setError(err.message || 'Could not save beneficiary');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!token) return;
    try {
      await api.deleteBeneficiary?.(token, id);
      await load();
    } catch {
      /* ignore */
    }
    setMenuOpen(null);
  }

  const filtered = people.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.nickname || '').toLowerCase().includes(q) ||
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.bank_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="beneficiaries-page">
      <div className="beneficiaries-header">
        <div className="beneficiaries-header-left">
          <h1 className="beneficiaries-title">Beneficiaries</h1>
          <p className="beneficiaries-subtitle">People you send money to.</p>
        </div>
        <button className="btn btn-primary beneficiaries-add-btn" onClick={openPanel}>
          <PlusIcon />
          Add beneficiary
        </button>
      </div>

      <div className="beneficiaries-search-wrap">
        <div className="beneficiaries-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search beneficiaries"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {successMsg && (
        <div className="beneficiaries-success">
          <CheckCircleIcon />
          {successMsg}
        </div>
      )}

      <div className="beneficiaries-list">
        {filtered.length === 0 && (
          <div className="beneficiaries-empty">
            <div className="beneficiaries-empty-icon">
              <PeopleOutlineIcon />
            </div>
            <p className="beneficiaries-empty-title">
              {searchQuery ? 'No matches found' : 'No beneficiaries yet'}
            </p>
            <p className="beneficiaries-empty-text">
              {searchQuery
                ? 'Try a different search term.'
                : 'Add someone you send money to regularly.'}
            </p>
          </div>
        )}

        {filtered.map((p) => (
          <div key={p.id} className="beneficiary-row">
            <div
              className="beneficiary-avatar"
              style={{ background: getAvatarColor(p.nickname || p.full_name) }}
            >
              {getInitial(p.nickname || p.full_name)}
            </div>

            <div className="beneficiary-info">
              <div className="beneficiary-name-row">
                <span className="beneficiary-nickname">{p.nickname}</span>
                {p.verified && (
                  <span className="beneficiary-verified">
                    <VerifiedIcon />
                    Verified
                  </span>
                )}
              </div>
              <span className="beneficiary-fullname">{p.full_name}</span>
              <div className="beneficiary-details">
                <span className="beneficiary-bank">{p.bank_name}</span>
                <span className="beneficiary-dot">·</span>
                <span className="beneficiary-account">{p.account_number || maskAccount(p.raw_account || '')}</span>
              </div>
            </div>

            <div className="beneficiary-actions" ref={menuOpen === p.id ? menuRef : undefined}>
              <button
                className="beneficiary-menu-btn"
                onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
                aria-label="Actions"
              >
                <MoreIcon />
              </button>
              {menuOpen === p.id && (
                <div className="beneficiary-dropdown">
                  <button className="beneficiary-dropdown-item" onClick={() => setMenuOpen(null)}>
                    Send money
                  </button>
                  <button className="beneficiary-dropdown-item" onClick={() => setMenuOpen(null)}>
                    Edit nickname
                  </button>
                  <button
                    className="beneficiary-dropdown-item danger"
                    onClick={() => handleDelete(p.id)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="beneficiaries-trust">
        <p className="beneficiaries-trust-text">
          Beneficiaries are verified before they're saved.
        </p>
        <p className="beneficiaries-trust-monnify">
          <MonnifyIcon />
          Verification powered by Monnify
        </p>
      </div>

      {panelOpen && (
        <div className="beneficiary-panel-backdrop" onClick={closePanel}>
          <div className="beneficiary-panel" onClick={(e) => e.stopPropagation()}>
            <div className="beneficiary-panel-header">
              <h2 className="beneficiary-panel-title">Add beneficiary</h2>
              <button className="beneficiary-panel-close" onClick={closePanel} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="beneficiary-panel-body">
              {step === 'form' && (
                <form onSubmit={handleResolve}>
                  <div className="field">
                    <label>Nickname</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. Mummy"
                      maxLength={40}
                    />
                  </div>
                  <div className="field">
                    <label>Account number</label>
                    <input
                      type="text"
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
                    className="btn btn-primary beneficiary-panel-submit"
                    disabled={resolving}
                  >
                    {resolving ? (
                      <span className="beneficiary-panel-spinner">
                        <SpinnerIcon />
                        Verifying…
                      </span>
                    ) : (
                      'Verify account'
                    )}
                  </button>
                </form>
              )}

              {step === 'verified' && resolved && (
                <div className="beneficiary-verified-state">
                  <div className="beneficiary-verified-badge">
                    <VerifiedLargeIcon />
                    <span className="beneficiary-verified-label">Account verified</span>
                  </div>

                  <div className="beneficiary-verified-card">
                    <div className="beneficiary-verified-row">
                      <span className="beneficiary-verified-detail-label">Account name</span>
                      <span className="beneficiary-verified-detail-value">{resolved.account_name}</span>
                    </div>
                    <div className="beneficiary-verified-row">
                      <span className="beneficiary-verified-detail-label">Bank</span>
                      <span className="beneficiary-verified-detail-value">
                        {resolved.bank_name || banks.find((b) => b.code === resolved.bank_code)?.name}
                      </span>
                    </div>
                    <div className="beneficiary-verified-row">
                      <span className="beneficiary-verified-detail-label">Account number</span>
                      <span className="beneficiary-verified-detail-value">
                        {maskAccount(resolved.account_number)}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSave}>
                    <div className="field">
                      <label>Nickname for this person</label>
                      <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. Mummy"
                        maxLength={40}
                        required
                        autoFocus
                      />
                    </div>

                    {error && <p className="error">{error}</p>}

                    <div className="beneficiary-panel-actions">
                      <button
                        type="button"
                        className="btn btn-soft beneficiary-panel-back-btn"
                        onClick={() => { setStep('form'); setError(''); }}
                        disabled={saving}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary beneficiary-panel-submit"
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save beneficiary'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function VerifiedLargeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 2.4M12 22l-2.4-2.4M2 12l2.4-2.4M22 12l-2.4-2.4" />
      <circle cx="12" cy="12" r="8" />
      <polyline points="8.5 12 11 14.5 16 9.5" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="8.5 12 11 14.5 16 9.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function PeopleOutlineIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MonnifyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}
