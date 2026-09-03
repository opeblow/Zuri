import { useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira, handleAuthError, AuthError } from '../lib/api.js';
import PinModal from './PinModal.jsx';
import TransferOverlay from './TransferOverlay.jsx';

const BILLER_CATEGORIES = [
  {
    category: 'Electricity',
    billers: [
      { id: 'ikeja-electric', name: 'Ikeja Electric', label: 'Meter Number' },
      { id: 'eko-electric', name: 'Eko Electric', label: 'Meter Number' },
      { id: 'ibadan-electric', name: 'Ibadan Electric', label: 'Meter Number' },
      { id: 'enugu-electric', name: 'Enugu Electric', label: 'Meter Number' },
    ],
  },
  {
    category: 'Cable TV',
    billers: [
      { id: 'dstv', name: 'DSTV', label: 'Smartcard Number' },
      { id: 'gotv', name: 'GOTV', label: 'Smartcard Number' },
      { id: 'startimes', name: 'StarTimes', label: 'Smartcard Number' },
    ],
  },
  {
    category: 'Internet',
    billers: [
      { id: 'spectranet', name: 'Spectranet', label: 'Account Number' },
      { id: 'globacom', name: 'Glo Air Fiber', label: 'Account Number' },
    ],
  },
];

export default function PayBillsModal({ onClose }) {
  const { token, refreshAccount } = useAuth();
  const [step, setStep] = useState('form');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBiller, setSelectedBiller] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [error, setError] = useState('');

  const categoryObj = BILLER_CATEGORIES.find((c) => c.category === selectedCategory);
  const billerObj = categoryObj?.billers.find((b) => b.id === selectedBiller);

  function handleCategorySelect(cat) {
    setSelectedCategory(cat);
    setSelectedBiller('');
    setMeterNumber('');
    setError('');
  }

  function handleContinue(e) {
    e.preventDefault();
    if (!selectedBiller) { setError('Select a biller'); return; }
    if (!meterNumber.trim()) { setError('Enter your meter/smartcard number'); return; }
    const kobo = Math.round(parseFloat(amount) * 100);
    if (!kobo || kobo <= 0) { setError('Enter a valid amount'); return; }
    setError('');
    setStep('confirm');
  }

  async function handlePinConfirm(pin) {
    if (!token) {
      handleAuthError();
      throw new AuthError();
    }
    const kobo = Math.round(parseFloat(amount) * 100);
    try {
      await api.transfer(token, {
        category: 'bills',
        amount_kobo: kobo,
        counterparty_name: billerObj.name,
        pin,
      });
    } catch (err) {
      console.error('Payment failed:', err);
      throw err;
    }
    setPinOpen(false);
    setOverlay('loading');
    await refreshAccount();
    setOverlay('success');
  }

  const presetAmounts = [5000, 10000, 15000, 20000, 50000];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {step === 'form' && (
          <>
            <h2>Pay Bills</h2>
            <p className="lede">Select a category and enter details</p>
            <form onSubmit={handleContinue} className="field-group">
              <div>
                <label>Category</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {BILLER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.category}
                      type="button"
                      className={`btn ${selectedCategory === cat.category ? '' : 'btn-soft'}`}
                      style={{ fontSize: '0.85rem' }}
                      onClick={() => handleCategorySelect(cat.category)}
                    >
                      {cat.category}
                    </button>
                  ))}
                </div>
              </div>

              {categoryObj && (
                <div>
                  <label>Provider</label>
                  <select
                    value={selectedBiller}
                    onChange={(e) => { setSelectedBiller(e.target.value); setError(''); }}
                  >
                    <option value="">Select provider</option>
                    {categoryObj.billers.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {billerObj && (
                <>
                  <div>
                    <label>{billerObj.label}</label>
                    <input
                      type="text"
                      value={meterNumber}
                      onChange={(e) => setMeterNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      placeholder="Enter number"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label>Amount (₦)</label>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      style={{ fontSize: '1.1rem' }}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {presetAmounts.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="btn btn-soft"
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                          onClick={() => setAmount(String(v / 100))}
                        >
                          {formatNaira(v)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && <p className="error">{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
                <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                <button type="submit" className="btn" style={{ flex: 1 }} disabled={!selectedBiller}>Continue</button>
              </div>
            </form>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2>Confirm Payment</h2>
            <div style={{
              textAlign: 'center',
              margin: '1rem 0',
              padding: '14px',
              background: '#F3E8FF',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#7C3AED' }}>
                {formatNaira(Math.round(parseFloat(amount) * 100))}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: 4, color: '#111827' }}>
                {billerObj?.name}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: 2 }}>
                {billerObj?.label}: {meterNumber}
              </div>
            </div>
            <p className="lede" style={{ marginBottom: 12, textAlign: 'center' }}>Enter your PIN to pay</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
              <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => setStep('form')}>Back</button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setPinOpen(true)}>Pay with PIN</button>
            </div>
          </>
        )}

        {pinOpen && (
          <PinModal
            title="Confirm Payment"
            subtitle={`Pay ${formatNaira(Math.round(parseFloat(amount) * 100))} to ${billerObj?.name}`}
            onConfirm={handlePinConfirm}
            onClose={() => setPinOpen(false)}
            onAuthError={handleAuthError}
            busy={false}
          />
        )}

        {overlay && (
          <TransferOverlay
            status={overlay}
            message={overlay === 'success' ? 'Payment successful' : overlay === 'error' ? error : 'Processing payment…'}
            onDone={() => { setOverlay(null); if (overlay === 'success') onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
