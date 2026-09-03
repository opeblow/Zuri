import { useState } from 'react';

/**
 * Post-transfer prompt to save the recipient as a beneficiary.
 */
export default function SaveBeneficiaryModal({ accountName, defaultNickname, onSave, onSkip, busy }) {
  const [nickname, setNickname] = useState(defaultNickname || '');

  function handleSave(e) {
    e.preventDefault();
    if (!nickname.trim()) return;
    onSave(nickname.trim());
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Save Beneficiary?</h2>
        <p className="lede" style={{ marginBottom: 16 }}>
          Save <strong>{accountName}</strong> so you can send money by just saying their name next time.
        </p>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--slate)' }}>
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="input"
              style={{ width: '100%' }}
              placeholder="e.g. Obi, Mummy, Landlord"
              maxLength={40}
              disabled={busy}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 14 }}>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onSkip} disabled={busy}>
              Skip
            </button>
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={busy || !nickname.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
