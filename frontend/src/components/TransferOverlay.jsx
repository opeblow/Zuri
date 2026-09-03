import { useEffect, useState } from 'react';

/**
 * Full-screen overlay that shows transfer processing state:
 *  1. Spinning loader while processing
 *  2. Green checkmark on success / red X on failure
 *  3. Auto-dismisses after a short delay
 */

const ICON_SIZE = 72;
const STROKE = 4;

function SpinnerIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 72 72"
      fill="none"
      className="transfer-spinner"
      aria-label="Processing"
    >
      <circle
        cx="36"
        cy="36"
        r="30"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={STROKE}
      />
      <circle
        cx="36"
        cy="36"
        r="30"
        stroke="var(--glow)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray="140 60"
        className="transfer-spinner-ring"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 72 72"
      fill="none"
      className="transfer-result-icon transfer-result-enter"
      aria-label="Success"
    >
      <circle cx="36" cy="36" r="30" fill="var(--glow)" fillOpacity="0.15" />
      <circle cx="36" cy="36" r="30" stroke="var(--glow)" strokeWidth={STROKE} />
      <polyline
        points="24,37 33,46 49,28"
        stroke="var(--glow)"
        strokeWidth={STROKE + 1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transfer-check-draw"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 72 72"
      fill="none"
      className="transfer-result-icon transfer-result-enter"
      aria-label="Failed"
    >
      <circle cx="36" cy="36" r="30" fill="var(--danger)" fillOpacity="0.12" />
      <circle cx="36" cy="36" r="30" stroke="var(--danger)" strokeWidth={STROKE} />
      <line
        x1="26"
        y1="26"
        x2="46"
        y2="46"
        stroke="var(--danger)"
        strokeWidth={STROKE + 1}
        strokeLinecap="round"
        className="transfer-x-draw"
      />
      <line
        x1="46"
        y1="26"
        x2="26"
        y2="46"
        stroke="var(--danger)"
        strokeWidth={STROKE + 1}
        strokeLinecap="round"
        className="transfer-x-draw"
      />
    </svg>
  );
}

/**
 * @param {'loading'|'success'|'error'} status
 * @param {string} message - Text shown below the icon
 * @param {() => void} onDone - Called when overlay should close
 * @param {number} autoDismissMs - Auto-close delay after success/error
 */
export default function TransferOverlay({
  status,
  message,
  onDone,
  autoDismissMs = 2000,
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [status, autoDismissMs, onDone]);

  if (!visible) return null;

  return (
    <div className="transfer-overlay" role="status" aria-live="assertive">
      <div className="transfer-overlay-content">
        {status === 'loading' && <SpinnerIcon />}
        {status === 'success' && <CheckIcon />}
        {status === 'error' && <CrossIcon />}
        {message && (
          <p
            className="transfer-overlay-msg"
            style={{
              color:
                status === 'error'
                  ? 'var(--danger)'
                  : status === 'success'
                    ? 'var(--glow)'
                    : '#fff',
            }}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
