// Zuri — PIN confirmation modal for transfers and settings
import { useEffect, useState, useCallback, useRef } from 'react';
import { AuthError } from '../lib/api.js';

export default function PinModal({ title, subtitle, onConfirm, onClose, busy, onAuthError }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const submit = useCallback(async (p) => {
    if (submitting || busy) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(p);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof AuthError) {
        if (onAuthError) onAuthError();
        return;
      }
      setError(err.message || 'Incorrect PIN');
      setPin('');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [onConfirm, busy, submitting, onAuthError]);

  function press(digit) {
    if (pin.length >= 4 || busy || submitting) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      submit(next);
    }
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
    setError('');
  }

  const canConfirm = pin.length === 4 && !submitting && !busy;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal pin-modal">
        <h2>{title}</h2>
        <p className="lede" style={{ marginBottom: 8 }}>
          {subtitle}
        </p>
        <div className="pin-dots" aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot${pin.length > i ? ' filled' : ''}`} />
          ))}
        </div>
        {error && <p className="error" style={{ textAlign: 'center' }}>{error}</p>}
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) => {
            if (key === '') return <span key={idx} />;
            if (key === '⌫')
              return (
                <button type="button" key={key} onClick={backspace} aria-label="Delete" className="pin-key">
                  ⌫
                </button>
              );
            return (
              <button type="button" key={key} onClick={() => press(key)} disabled={busy || submitting} className="pin-key">
                {key}
              </button>
            );
          })}
        </div>
        <div className="pin-actions">
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1.5 }}
            onClick={() => canConfirm && submit(pin)}
            disabled={!canConfirm}
          >
            {submitting ? 'Processing…' : 'Confirm & Pay'}
          </button>
        </div>
      </div>
    </div>
  );
}
