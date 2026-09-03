import { useState } from 'react';
import { formatNaira } from '../lib/api.js';

const NIGERIAN_BANKS = [
  { code: '058', name: 'GTBank' },
  { code: '033', name: 'UBA' },
  { code: '011', name: 'First Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '032', name: 'Union Bank' },
  { code: '044', name: 'Access Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '215', name: 'Unity Bank' },
  { code: '050', name: 'Ecobank' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '035', name: 'Wema Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '999', name: 'Moniepoint MFB' },
];

export default function BankDetailsModal({ title, subtitle, amountKobo, onNext, onClose, loading }) {
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState(NIGERIAN_BANKS[0].code);
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (accountNumber.length !== 10) {
      setError('Account number must be 10 digits');
      return;
    }
    const bankName = NIGERIAN_BANKS.find((b) => b.code === bankCode)?.name;
    onNext({ accountNumber, bankCode, bankName });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{title}</h2>
        {amountKobo > 0 && (
          <div style={{ textAlign: 'center', margin: '8px 0 4px', fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)' }}>
            {formatNaira(amountKobo)}
          </div>
        )}
        <p className="lede" style={{ marginBottom: 16 }}>
          {subtitle}
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--slate)' }}>
              Bank
            </label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="input"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {NIGERIAN_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--slate)' }}>
              Account Number
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="input"
              style={{ width: '100%' }}
              placeholder="0123456789"
              inputMode="numeric"
              disabled={loading}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 14 }}>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Verifying…' : 'Next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
