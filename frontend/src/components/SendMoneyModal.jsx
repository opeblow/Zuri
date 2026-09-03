import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira, handleAuthError, AuthError } from '../lib/api.js';
import PinModal from './PinModal.jsx';
import TransferOverlay from './TransferOverlay.jsx';

export default function SendMoneyModal({ onClose }) {
  const { token, refreshAccount } = useAuth();
  const [step, setStep] = useState('form');
  const [banks, setBanks] = useState([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState(null);
  const [form, setForm] = useState({ account_number: '' });
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [amount, setAmount] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bankDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const DEFAULT_BANKS = [
    { code: '057', name: 'Wema Bank' },
    { code: '011', name: 'First Bank of Nigeria' },
    { code: '058', name: 'Guaranty Trust Bank' },
    { code: '044', name: 'Access Bank' },
    { code: '033', name: 'United Bank for Africa' },
    { code: '232', name: 'Sterling Bank' },
    { code: '035', name: 'Moniepoint Microfinance Bank' },
    { code: '50211', name: 'Kuda Microfinance Bank' },
    { code: '999991', name: 'OPay Digital Services Limited' },
    { code: '999992', name: 'PalmPay Limited' },
    { code: '054', name: 'Zenith Bank' },
    { code: '214', name: 'First City Monument Bank' },
    { code: '070', name: 'Fidelity Bank' },
    { code: '050', name: 'Ecobank Nigeria' },
    { code: '221', name: 'Stanbic IBTC Bank' },
    { code: '030', name: 'Heritage Bank' },
    { code: '032', name: 'Union Bank of Nigeria' },
    { code: '076', name: 'Polaris Bank' },
    { code: '101', name: 'Providus Bank' },
    { code: '215', name: 'Unity Bank' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '001', name: 'Globus Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '100', name: 'SunTrust Bank' },
  ];

  useEffect(() => {
    (token ? api.fetchBanks() : api.banks()).then((d) => {
      const list = d.banks || [];
      setBanks(list.length ? list : DEFAULT_BANKS);
    }).catch(() => {
      setBanks(DEFAULT_BANKS);
    });
  }, [token]);

  const TOP_BANKS = useMemo(() => {
    const popular = ['Wema', 'Zenith', 'Access', 'First Bank', 'Guaranty Trust', 'United Bank', 'Sterling', 'Kuda', 'OPay'];
    const found = popular
      .map((name) => banks.find((b) => b.name.toLowerCase().includes(name.toLowerCase())))
      .filter(Boolean)
      .filter((b, i, arr) => arr.findIndex((x) => x.code === b.code) === i);
    if (found.length) return found;
    return banks.slice(0, 6);
  }, [banks]);

  const showBankSection = form.account_number.length === 10;

  useEffect(() => {
    if (!bankOpen) return;
    function handleClick(e) {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target)) {
        setBankOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bankOpen]);

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) return banks;
    const q = bankSearch.toLowerCase();
    return banks.filter((b) => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }, [banks, bankSearch]);

  useEffect(() => {
    if (form.account_number.length === 10 && selectedBank) {
      handleAutoResolve();
    }
  }, [form.account_number, selectedBank]);

  async function handleAutoResolve() {
    setResolving(true);
    setError('');
    try {
      const data = token
        ? await api.resolveBeneficiary(token, { account_number: form.account_number, bank_code: selectedBank.code })
        : { account_name: 'Resolved Account', account_number: form.account_number, bank_code: selectedBank.code, bank_name: selectedBank.name };
      setResolved(data);
    } catch {
      setResolved(null);
    } finally {
      setResolving(false);
    }
  }

  function handleAmountSubmit(e) {
    e.preventDefault();
    const kobo = Math.round(parseFloat(amount) * 100);
    if (!kobo || kobo <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setError('');
    setPinOpen(true);
  }

  async function handlePinConfirm(pin) {
    if (!token) {
      handleAuthError();
      throw new AuthError();
    }
    const kobo = Math.round(parseFloat(amount) * 100);
    try {
      await api.transfer(token, {
        category: 'transfers',
        amount_kobo: kobo,
        counterparty_name: resolved.account_name,
        account_number: form.account_number,
        bank_code: selectedBank.code,
        pin,
      });
    } catch (err) {
      console.error('Transfer failed:', err);
      throw err;
    }
    setPinOpen(false);
    setOverlay('loading');
    await refreshAccount();
    setOverlay('success');
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {step === 'form' && (
          <>
            <h2>Send Money</h2>
            <p className="lede">Enter recipient details</p>
            <div className="field-group">
              <div>
                <label>Account Number</label>
                <input
                  type="text"
                  value={form.account_number}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setForm({ ...form, account_number: val });
                    if (val.length < 10) {
                      setSelectedBank(null);
                      setResolved(null);
                      setError('');
                    }
                  }}
                  placeholder="0123456789"
                  inputMode="numeric"
                  autoFocus
                />
              </div>

              {showBankSection && (
                <>
                  <div style={{ position: 'relative' }} ref={bankDropdownRef}>
                    <label>Select Bank</label>
                    <button
                      type="button"
                      className="modal-select-btn"
                      onClick={() => { setBankOpen(!bankOpen); setBankSearch(''); }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedBank?.name || 'Choose a bank'}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: '0.7rem', color: '#9CA3AF', marginLeft: 8 }}>{bankOpen ? '▲' : '▼'}</span>
                    </button>
                    {bankOpen && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: '#FFFFFF',
                        border: '1px solid #E5E7EB',
                        borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                        zIndex: 60,
                        maxHeight: 260,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}>
                        <div style={{ padding: '8px', borderBottom: '1px solid #F3F4F6' }}>
                          <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search banks…"
                            value={bankSearch}
                            onChange={(e) => setBankSearch(e.target.value)}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #E5E7EB',
                              borderRadius: 8,
                              fontSize: '0.88rem',
                              outline: 'none',
                              boxSizing: 'border-box',
                              background: '#F9FAFB',
                            }}
                          />
                        </div>
                        <div style={{ overflowY: 'auto', maxHeight: 210 }}>
                          {filteredBanks.length === 0 && (
                            <div style={{ padding: '12px', color: '#9CA3AF', fontSize: '0.85rem', textAlign: 'center' }}>No banks found</div>
                          )}
                          {filteredBanks.map((b) => {
                            const isSelected = selectedBank?.code === b.code;
                            return (
                              <button
                                key={b.code + b.name}
                                type="button"
                                onClick={() => { setSelectedBank(b); setBankOpen(false); setBankSearch(''); setError(''); }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%',
                                  padding: '10px 12px',
                                  textAlign: 'left',
                                  border: 'none',
                                  borderBottom: '1px solid #F9FAFB',
                                  background: isSelected ? '#F3E8FF' : 'transparent',
                                  cursor: 'pointer',
                                  fontSize: '0.88rem',
                                  color: isSelected ? '#7C3AED' : '#111827',
                                  fontWeight: isSelected ? 600 : 400,
                                }}
                              >
                                <span>{b.name}</span>
                                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{b.code}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {!selectedBank && TOP_BANKS.length > 0 && (
                    <div>
                      <label>Popular Banks</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {TOP_BANKS.map((b) => (
                          <button
                            key={b.code}
                            type="button"
                            className="btn btn-soft"
                            style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                            onClick={() => { setSelectedBank(b); setError(''); }}
                          >
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {resolving && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#7C3AED' }}>
                      <span style={{ width: 14, height: 14, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
                      Resolving account name…
                    </div>
                  )}

                  {resolved && !resolving && (
                    <div style={{
                      padding: '12px 14px',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: 10,
                      fontSize: '0.92rem',
                    }}>
                      <span style={{ color: '#6B7280', fontSize: '0.82rem', fontWeight: 500 }}>Account Name</span>
                      <div style={{ fontWeight: 600, color: '#111827', marginTop: 2 }}>{resolved.account_name}</div>
                    </div>
                  )}
                </>
              )}

              {error && <p className="error">{error}</p>}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
                <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={resolving || !selectedBank || !resolved || form.account_number.length !== 10}
                  onClick={() => { if (resolved) setStep('amount'); }}
                >
                  {resolving ? 'Verifying…' : 'Next'}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'amount' && resolved && (
          <>
            <h2>Send Money</h2>
            <div style={{
              textAlign: 'center',
              margin: '1rem 0 0.25rem',
              padding: '14px',
              background: '#F3E8FF',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{resolved.account_name}</div>
              <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: 2 }}>{selectedBank?.name} · {form.account_number}</div>
            </div>
            <form onSubmit={handleAmountSubmit} className="field-group" style={{ marginTop: 12 }}>
              <div>
                <label>Amount (₦)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  style={{ fontSize: '1.2rem', fontWeight: 600 }}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoFocus
                />
              </div>
              {error && <p className="error">{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
                <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => { setStep('form'); setError(''); }}>Back</button>
                <button type="submit" className="btn" style={{ flex: 1 }}>Continue</button>
              </div>
            </form>
          </>
        )}

        {pinOpen && (
          <PinModal
            title="Confirm Transfer"
            subtitle={`Send ${formatNaira(Math.round(parseFloat(amount) * 100))} to ${resolved?.account_name}`}
            onConfirm={handlePinConfirm}
            onClose={() => setPinOpen(false)}
            onAuthError={handleAuthError}
            busy={busy}
          />
        )}

        {overlay && (
          <TransferOverlay
            status={overlay}
            message={overlay === 'success' ? 'Transfer successful' : overlay === 'error' ? error : 'Processing transfer…'}
            onDone={() => { setOverlay(null); if (overlay === 'success') onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
