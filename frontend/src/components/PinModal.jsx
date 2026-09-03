import { useEffect, useState } from 'react';

export default function PinModal({ title, subtitle, onConfirm, onClose, busy }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPin('');
    setError('');
  }, []);

  function press(digit) {
    if (pin.length >= 4 || busy) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      Promise.resolve(onConfirm(next)).catch((err) => {
        setError(err.message || 'Incorrect PIN');
        setPin('');
      });
    }
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
    setError('');
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{title}</h2>
        <p className="lede" style={{ marginBottom: 8 }}>
          {subtitle}
        </p>
        <div className="pin-dots" aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot${pin.length > i ? ' filled' : ''}`} />
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) => {
            if (key === '') return <span key={idx} />;
            if (key === '⌫')
              return (
                <button type="button" key={key} onClick={backspace} aria-label="Delete">
                  ⌫
                </button>
              );
            return (
              <button type="button" key={key} onClick={() => press(key)} disabled={busy}>
                {key}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-soft" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
