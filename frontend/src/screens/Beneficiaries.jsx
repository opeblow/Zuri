import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira, handleAuthError } from '../lib/api.js';
import PinModal from '../components/PinModal.jsx';

export default function Beneficiaries() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [nickname, setNickname] = useState('');

  const [sendTarget, setSendTarget] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    load();
    api.banks(token).then((d) => setBanks(d.banks || [])).catch(() => setBanks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    if (!token) return;
    try {
      const d = await api.beneficiaries(token);
      setList(d.beneficiaries || []);
    } catch {
      setList([]);
    }
  }

  function resetAddForm() {
    setAccountNumber('');
    setBankCode('');
    setResolved(null);
    setNickname('');
  }

  async function verifyAccount() {
    if (!accountNumber.trim() || !bankCode) return;
    setResolving(true);
    setErrorMsg('');
    try {
      const data = await api.resolveAccount(token, { account_number: accountNumber.trim(), bank_code: bankCode });
      setResolved(data);
      setNickname(data.account_name.split(' ')[0]);
    } catch (err) {
      setErrorMsg(err.message || 'Could not verify that account.');
    } finally {
      setResolving(false);
    }
  }

  async function saveBeneficiary() {
    if (!resolved || !nickname.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await api.addBeneficiary(token, {
        nickname: nickname.trim(),
        full_name: resolved.account_name,
        account_number: resolved.account_number,
        bank_code: bankCode,
      });
      await load();
      setAddOpen(false);
      resetAddForm();
    } catch (err) {
      setErrorMsg(err.message || 'Could not save beneficiary.');
    } finally {
      setLoading(false);
    }
  }

  async function removeBeneficiary(id) {
    try {
      await api.deleteBeneficiary(token, id);
      setList((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setErrorMsg(err.message || 'Could not remove beneficiary.');
    }
  }

  function openSend(b) {
    setSendTarget(b);
    setAmountInput('');
    setLastResult(null);
  }

  function requirePin(actionFn) {
    setPendingAction(() => actionFn);
    setPinOpen(true);
  }

  async function handlePinSubmit(pin) {
    setPinOpen(false);
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await pendingAction(pin);
      setLastResult(result);
      setSendTarget(null);
      await load();
    } catch (err) {
      setErrorMsg(err.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  }

  function submitSend() {
    const kobo = Math.round(parseFloat(amountInput) * 100);
    if (!kobo || kobo <= 0 || !sendTarget) return;
    requirePin((pin) => api.transfer(token, { beneficiary_id: sendTarget.id, amount_kobo: kobo, pin }));
  }

  return (
    <div className="goals-page">
      <div className="goals-header">
        <div className="goals-header-left">
          <h1 className="goals-title">Beneficiaries</h1>
          <p className="goals-subtitle">People you send money to, verified with Monnify.</p>
        </div>
        <button
          className="btn btn-primary goals-new-btn"
          onClick={() => { resetAddForm(); setAddOpen(true); }}
          disabled={loading}
        >
          <PlusIcon />
          Add beneficiary
        </button>
      </div>

      {errorMsg && <p className="error" style={{ margin: '0 48px 16px' }}>{errorMsg}</p>}

      {lastResult && (
        <p className="lede" style={{ margin: '0 48px 16px', color: 'var(--dash-text-secondary)' }}>
          Transfer sent — reference {lastResult.reference}. New balance: {lastResult.new_balance_display}.
        </p>
      )}

      <div className="goals-list" style={{ padding: '0 48px 36px' }}>
        {list.length === 0 && (
          <div className="goals-empty">
            <div className="goals-empty-icon"><PeopleIcon /></div>
            <p className="goals-empty-title">No beneficiaries yet</p>
            <p className="goals-empty-text">Add someone's account to start sending money.</p>
          </div>
        )}

        {list.map((b) => (
          <div className="goal-card" key={b.id}>
            <div className="goal-card-top">
              <div className="goal-card-info">
                <h3 className="goal-card-name">{b.nickname}</h3>
                <p className="goal-card-target">{b.full_name}</p>
              </div>
            </div>
            <div className="goal-card-bottom">
              <div className="goal-card-meta">
                <span className="goal-card-recurring">Sent {b.send_count || 0} time{b.send_count === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="goal-card-manage" onClick={() => removeBeneficiary(b.id)}>Remove</button>
                <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => openSend(b)}>Send</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add a beneficiary</h2>
            <p className="lede">We verify the real account name with Monnify before saving.</p>
            <div className="field-group">
              <div className="field">
                <label>Bank</label>
                <select value={bankCode} onChange={(e) => { setBankCode(e.target.value); setResolved(null); }}>
                  <option value="">Select bank</option>
                  {banks.map((bk) => (
                    <option key={bk.code} value={bk.code}>{bk.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Account number</label>
                <input
                  value={accountNumber}
                  onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, '')); setResolved(null); }}
                  placeholder="0123456789"
                  maxLength={10}
                />
              </div>
              {!resolved ? (
                <button
                  className="btn btn-soft"
                  onClick={verifyAccount}
                  disabled={resolving || !bankCode || accountNumber.length < 10}
                >
                  {resolving ? 'Verifying…' : 'Verify account'}
                </button>
              ) : (
                <>
                  <div className="field">
                    <label>Verified name</label>
                    <input value={resolved.account_name} disabled />
                  </div>
                  <div className="field">
                    <label>Save as (nickname)</label>
                    <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Mummy" autoFocus />
                  </div>
                </>
              )}
            </div>
            <div className="row-split" style={{ marginTop: 10 }}>
              <button className="btn btn-soft" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!resolved || !nickname.trim() || loading} onClick={saveBeneficiary}>
                Save beneficiary
              </button>
            </div>
          </div>
        </div>
      )}

      {sendTarget && (
        <div className="modal-backdrop" onClick={() => setSendTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Send to {sendTarget.nickname}</h2>
            <p className="lede">{sendTarget.full_name}</p>
            <div className="field">
              <label>Amount (₦)</label>
              <input
                type="number"
                min="1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="row-split" style={{ marginTop: 10 }}>
              <button className="btn btn-soft" onClick={() => setSendTarget(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!amountInput || Number(amountInput) <= 0} onClick={submitSend}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {pinOpen && (
        <PinModal
          title="Confirm transfer"
          subtitle={sendTarget ? `Send ${formatNaira(Math.round(parseFloat(amountInput || '0') * 100))} to ${sendTarget.full_name}` : ''}
          onClose={() => setPinOpen(false)}
          onConfirm={(pin) => handlePinSubmit(pin)}
          onAuthError={handleAuthError}
        />
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

function PeopleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
