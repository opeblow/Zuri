import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira, handleAuthError, AuthError } from '../lib/api.js';
import PinModal from './PinModal.jsx';
import TransferOverlay from './TransferOverlay.jsx';

const NETWORKS = [
  { id: 'mtn', name: 'MTN', color: '#FFCC00' },
  { id: 'airtel', name: 'Airtel', color: '#ED1C24' },
  { id: 'glo', name: 'Glo', color: '#00A651' },
  { id: '9mobile', name: '9mobile', color: '#006B3F' },
];

const PREFIX_NETWORK_MAP = {
  '0803': 'mtn', '0806': 'mtn', '0816': 'mtn', '0903': 'mtn', '0906': 'mtn',
  '0810': 'mtn', '0813': 'mtn', '0814': 'mtn', '0902': 'mtn', '0908': 'mtn',
  '0805': 'glo', '0807': 'glo', '0811': 'glo', '0815': 'glo', '0905': 'glo',
  '0802': 'airtel', '0808': 'airtel', '0812': 'airtel', '0701': 'airtel',
  '0708': 'airtel', '0901': 'airtel', '0907': 'airtel',
  '0809': '9mobile', '0817': '9mobile', '0818': '9mobile', '0909': '9mobile',
};

function detectNetwork(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return PREFIX_NETWORK_MAP[digits.slice(0, 4)] || null;
}

const PRESET_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

const DATA_BUNDLES = [
  { label: '500MB - 30 days', amount: 500 },
  { label: '1GB - 30 days', amount: 1000 },
  { label: '2GB - 30 days', amount: 1500 },
  { label: '5GB - 30 days', amount: 3000 },
];

export default function AirtimeDataModal({ onClose }) {
  const { token, refreshAccount } = useAuth();
  const [mode, setMode] = useState('airtime');
  const [step, setStep] = useState('form');
  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [error, setError] = useState('');

  const networkObj = NETWORKS.find((n) => n.id === network);

  const handlePhoneChange = useCallback((val) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    setPhone(digits);
    const detected = detectNetwork(digits);
    if (detected) {
      setNetwork(detected);
      setError('');
    }
  }, []);

  function handleContinue(e) {
    e.preventDefault();
    if (!network) { setError('Select a network provider'); return; }
    if (phone.length < 10) { setError('Enter a valid phone number'); return; }
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
        counterparty_name: `${networkObj.name} - ${mode === 'airtime' ? 'Airtime' : 'Data'}`,
        pin,
      });
    } catch (err) {
      console.error('Purchase failed:', err);
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
            <h2>Airtime &amp; Data</h2>
            <p className="lede">Buy airtime or data bundles</p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className={`btn ${mode === 'airtime' ? '' : 'btn-soft'}`}
                style={{ flex: 1 }}
                onClick={() => { setMode('airtime'); setAmount(''); setError(''); }}
              >
                Airtime
              </button>
              <button
                type="button"
                className={`btn ${mode === 'data' ? '' : 'btn-soft'}`}
                style={{ flex: 1 }}
                onClick={() => { setMode('data'); setAmount(''); setError(''); }}
              >
                Data
              </button>
            </div>

            <form onSubmit={handleContinue} className="field-group">
              <div>
                <label>Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="08012345678"
                  inputMode="numeric"
                />
                {network && (
                  <span style={{
                    display: 'inline-block',
                    marginTop: 6,
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: NETWORKS.find((n) => n.id === network)?.color + '22',
                    color: '#111827',
                  }}>
                    Detected: {NETWORKS.find((n) => n.id === network)?.name}
                  </span>
                )}
              </div>

              <div>
                <label>Network</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {NETWORKS.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`btn ${network === n.id ? '' : 'btn-soft'}`}
                      style={{
                        flex: 1,
                        fontSize: '0.82rem',
                        fontWeight: network === n.id ? 700 : 500,
                        borderColor: network === n.id ? n.color : undefined,
                      }}
                      onClick={() => { setNetwork(n.id); setError(''); }}
                    >
                      {n.name}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'airtime' ? (
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
                    {PRESET_AMOUNTS.map((v) => (
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
              ) : (
                <div>
                  <label>Data Bundle</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {DATA_BUNDLES.map((bundle) => (
                      <button
                        key={bundle.label}
                        type="button"
                        className={`btn ${amount === String(bundle.amount / 100) ? '' : 'btn-soft'}`}
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                        onClick={() => setAmount(String(bundle.amount / 100))}
                      >
                        <span>{bundle.label}</span>
                        <span style={{ fontWeight: 600 }}>{formatNaira(bundle.amount)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="error">{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
                <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                <button type="submit" className="btn" style={{ flex: 1 }}>Continue</button>
              </div>
            </form>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2>Confirm Purchase</h2>
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
                {networkObj?.name} {mode === 'airtime' ? 'Airtime' : 'Data'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: 2 }}>
                {phone}
              </div>
            </div>
            <p className="lede" style={{ marginBottom: 12, textAlign: 'center' }}>Enter your PIN to purchase</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
              <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => setStep('form')}>Back</button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setPinOpen(true)}>Pay with PIN</button>
            </div>
          </>
        )}

        {pinOpen && (
          <PinModal
            title="Confirm Purchase"
            subtitle={`Buy ${formatNaira(Math.round(parseFloat(amount) * 100))} ${mode === 'airtime' ? 'airtime' : 'data'} on ${networkObj?.name}`}
            onConfirm={handlePinConfirm}
            onClose={() => setPinOpen(false)}
            onAuthError={handleAuthError}
            busy={false}
          />
        )}

        {overlay && (
          <TransferOverlay
            status={overlay}
            message={overlay === 'success' ? 'Purchase successful' : overlay === 'error' ? error : 'Processing…'}
            onDone={() => { setOverlay(null); if (overlay === 'success') onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
