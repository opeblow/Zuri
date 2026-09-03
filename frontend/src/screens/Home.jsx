import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, speakText, formatNaira } from '../lib/api.js';
import PinModal from '../components/PinModal.jsx';
import BankDetailsModal from '../components/BankDetailsModal.jsx';
import ConfirmTransferModal from '../components/ConfirmTransferModal.jsx';
import SaveBeneficiaryModal from '../components/SaveBeneficiaryModal.jsx';
import TransferOverlay from '../components/TransferOverlay.jsx';

const SUGGESTIONS = [
  'How should I pay my rent this year? It\'s ₦900k due in November.',
  'Send ₦5,000 to Mummy',
  'Send ₦5,000 to Obi',
  'Ṣé mo ní owó tí mo lè fi rá phone tuntun báyìí?',
  'What\'s my balance?',
];

const YARNGPT_VOICES = ['Idera', 'Emma', 'Zainab', 'Osagie', 'Wura', 'Jude', 'Chinenye', 'Tayo', 'Regina', 'Femi', 'Adaora', 'Umar', 'Mary', 'Nonso', 'Remi', 'Adam'];

export default function Home() {
  const { token, account, refreshAccount, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Idera');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [bankDetailsLoading, setBankDetailsLoading] = useState(false);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);
  const [saveBeneOpen, setSaveBeneOpen] = useState(false);
  const [saveBeneBusy, setSaveBeneBusy] = useState(false);
  const [transferDetails, setTransferDetails] = useState(null);
  const [overlay, setOverlay] = useState({ show: false, status: 'loading', message: '' });
  const [reloading, setReloading] = useState(false);
  const feedRef = useRef(null);
  const recognitionRef = useRef(null);

  async function handleReload() {
    if (reloading) return;
    setReloading(true);
    await refreshAccount();
    setTimeout(() => setReloading(false), 500);
  }

  useEffect(() => {
    api.history(token).then((d) => setMessages(d.messages || []));
  }, [token]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => {
    function handleProactive(e) {
      setMessages((m) => [...m, { ...e.detail, proactive: true }]);
    }
    window.addEventListener('zuri_proactive_message', handleProactive);
    return () => window.removeEventListener('zuri_proactive_message', handleProactive);
  }, []);

  /**
   * Handles a decision payload from either SSE stream or standard REST.
   * Text and YarnGPT audio arrive together — plays immediately.
   */
  function handleDecision(data) {
    setMessages((m) => [...m, data.message]);

    // Play YarnGPT audio immediately (arrives with the response)
    const audioUrl = data.tts?.audioUrl || data.message?.audio_url;
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});
    }

    if (data.decision.requires_confirmation && data.decision.pending_action) {
      setPending(data.decision);
      if (data.decision.pending_action.type === 'prompt_beneficiary_details') {
        setBankDetailsOpen(true);
      } else {
        setPinOpen(true);
      }
    }
  }

  async function sendUtterance(utterance) {
    const clean = utterance.trim();
    if (!clean || busy) return;
    setBusy(true);
    setText('');
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        text: clean,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      // Try SSE streaming first (fastest path)
      await api.talkStream(token, clean, voice, {
        onStatus: () => {}, // "thinking" phase — spinner already visible
        onDecision: (data) => handleDecision(data),
        onError: (err) => {
          throw new Error(err.error || 'Stream error');
        },
      });
    } catch (streamErr) {
      // Fallback to standard REST if SSE fails
      try {
        const data = await api.talk(token, clean, voice);
        handleDecision(data);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: 'zuri',
            text: err.message || 'Something went quiet on my end.',
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending(pin) {
    if (!pending?.pending_action) return;
    const { type, payload } = pending.pending_action;

    setPinOpen(false);
    setOverlay({ show: true, status: 'loading', message: 'Processing…' });

    try {
      if (type === 'transfer') {
        const result = await api.transfer(token, {
          pin,
          beneficiary_id: payload.beneficiary_id,
          account_number: payload.account_number,
          bank_code: payload.bank_code,
          bank_name: payload.bank_name,
          amount_kobo: payload.amount_kobo,
        });
        const spoken = result.spoken;
        setMessages((m) => [
          ...m,
          result.message || {
            id: `ok-${Date.now()}`,
            role: 'zuri',
            text: spoken,
            intent: 'transfer_success',
            created_at: new Date().toISOString(),
          },
        ]);
        speakText(spoken, 'en', result.audioUrl);
        await refreshAccount();

        setOverlay({ show: true, status: 'success', message: 'Transfer sent!' });

        // If this was an ad-hoc transfer (no beneficiary_id), prompt to save
        if (!payload.beneficiary_id && payload.account_number) {
          setTransferDetails({
            accountNumber: payload.account_number,
            bankCode: payload.bank_code,
            bankName: payload.bank_name,
            accountName: result.account_name || `Account ${payload.account_number}`,
            recipientRef: pending.pending_action.payload.recipient_ref || '',
            amountKobo: payload.amount_kobo,
          });
          setPending(null);
          // saveBeneOpen will be triggered when overlay dismisses
          return;
        }
      } else if (type === 'create_goal' || type === 'create_goal_mandate') {
        const result = await api.createGoal(token, { ...payload, pin });
        const spoken = result.spoken;
        setMessages((m) => [
          ...m,
          result.message || {
            id: `ok-${Date.now()}`,
            role: 'zuri',
            text: spoken,
            intent: 'goal_created',
            created_at: new Date().toISOString(),
          },
        ]);
        speakText(spoken, 'en', result.audioUrl);
        setOverlay({ show: true, status: 'success', message: 'Done!' });
      } else if (type === 'deposit_goal') {
        const result = await api.depositGoal(token, payload.goal_id, { amount_kobo: payload.amount_kobo, pin });
        setOverlay({ show: true, status: 'success', message: 'Deposited!' });
      } else if (type === 'withdraw_goal') {
        const result = await api.withdrawGoal(token, payload.goal_id, { amount_kobo: payload.amount_kobo, pin });
        setOverlay({ show: true, status: 'success', message: 'Withdrawn!' });
      }
      setPending(null);
    } catch (err) {
      setOverlay({
        show: true,
        status: 'error',
        message: err.message || 'Incorrect PIN',
      });
    }
  }

  const handleOverlayDone = useCallback(() => {
    const wasAdHocSuccess =
      overlay.status === 'success' && transferDetails && !pending;
    setOverlay({ show: false, status: 'loading', message: '' });
    if (wasAdHocSuccess) {
      setSaveBeneOpen(true);
    }
  }, [overlay.status, transferDetails, pending]);

  /** Step 2 of ad-hoc flow: BankDetailsModal → verify account → ConfirmTransferModal */
  async function handleBankDetailsNext(details) {
    setBankDetailsLoading(true);
    try {
      const verified = await api.verifyAccount(token, {
        account_number: details.accountNumber,
        bank_code: details.bankCode,
      });
      setTransferDetails({
        accountNumber: details.accountNumber,
        bankCode: details.bankCode,
        bankName: details.bankName,
        accountName: verified.account_name,
        recipientRef: pending?.pending_action?.payload?.recipient_ref || '',
        amountKobo: pending?.pending_action?.payload?.amount_kobo || 0,
      });
      setBankDetailsOpen(false);
      setConfirmTransferOpen(true);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'zuri', text: `Verification failed: ${err.message}` },
      ]);
      setBankDetailsOpen(false);
      setPending(null);
    } finally {
      setBankDetailsLoading(false);
    }
  }

  /** Step 3 of ad-hoc flow: ConfirmTransferModal → execute transfer → SaveBeneficiaryModal */
  async function handleConfirmTransfer(pin) {
    if (!transferDetails) return;

    setConfirmTransferOpen(false);
    setOverlay({ show: true, status: 'loading', message: 'Processing…' });

    try {
      const result = await api.transfer(token, {
        pin,
        account_number: transferDetails.accountNumber,
        bank_code: transferDetails.bankCode,
        bank_name: transferDetails.bankName,
        amount_kobo: transferDetails.amountKobo,
      });
      const spoken = result.spoken;
      setMessages((m) => [
        ...m,
        result.message || {
          id: `ok-${Date.now()}`,
          role: 'zuri',
          text: spoken,
          intent: 'transfer_success',
          created_at: new Date().toISOString(),
        },
      ]);
      speakText(spoken, 'en', result.audioUrl);
      await refreshAccount();

      if (result.account_name) {
        setTransferDetails((d) => ({ ...d, accountName: result.account_name }));
      }

      setPending(null);
      setOverlay({ show: true, status: 'success', message: 'Transfer sent!' });
      // saveBeneOpen triggered via handleOverlayDone
    } catch (err) {
      setOverlay({
        show: true,
        status: 'error',
        message: err.message || 'Incorrect PIN',
      });
    }
  }

  /** Step 4: Save beneficiary or skip */
  async function handleSaveBeneficiary(nickname) {
    if (!transferDetails) return;
    setSaveBeneBusy(true);
    try {
      await api.addBeneficiary(token, {
        nickname,
        account_number: transferDetails.accountNumber,
        bank_code: transferDetails.bankCode,
      });
      setMessages((m) => [
        ...m,
        {
          id: `bene-${Date.now()}`,
          role: 'zuri',
          text: `Saved ${transferDetails.accountName} as "${nickname}". Next time just say "send money to ${nickname}".`,
          intent: 'beneficiary_saved',
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'zuri', text: `Couldn't save beneficiary: ${err.message}` },
      ]);
    } finally {
      setSaveBeneBusy(false);
      setSaveBeneOpen(false);
      setTransferDetails(null);
    }
  }

  function handleSkipSaveBene() {
    setSaveBeneOpen(false);
    setTransferDetails(null);
  }

  function toggleListen() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      sendUtterance(text || SUGGESTIONS[0]);
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = 'en-NG';
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript;
      sendUtterance(said);
    };
    rec.start();
  }

  async function fireSalary() {
    setBusy(true);
    try {
      await api.salaryDemo(token);
      setTimeout(async () => {
        const hist = await api.history(token);
        setMessages(hist.messages || []);
        await refreshAccount();
      }, 400);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="home-top">
        <div>
          <div className="brand-mini">Zuri</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {user?.full_name?.split(' ')[0] || 'You'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            value={voice} 
            onChange={(e) => setVoice(e.target.value)}
            style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {YARNGPT_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <div className="balance-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{account?.balance_display || '—'}</span>
            <button 
              onClick={handleReload}
              disabled={reloading}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text)'
              }}
              title="Reload Balance"
              aria-label="Reload Balance"
            >
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" 
                strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: reloading ? 'spinRing 1s linear infinite' : 'none' }}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {account?.demo_mode && (
        <div className="demo-bar">
          <span>Demo Moment 2 — salary webhook</span>
          <button type="button" onClick={fireSalary} disabled={busy}>
            Fire salary
          </button>
        </div>
      )}

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="suggestion" onClick={() => sendUtterance(s)}>
            {s.length > 42 ? `${s.slice(0, 42)}…` : s}
          </button>
        ))}
      </div>

      <div className="feed" ref={feedRef}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.role === 'user' ? 'user' : 'zuri'}${m.intent === 'salary_landed' || m.proactive ? ' proactive' : ''}`}
          >
            {m.text}
            {m.intent && m.role === 'zuri' && <span className="meta">{m.intent.replaceAll('_', ' ')}</span>}
          </div>
        ))}
        {busy && <div className="bubble zuri">Thinking with your money…</div>}
      </div>

      <div className="composer">
        <div className="composer-box">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask Zuri anything…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendUtterance(text);
            }}
          />
          <button type="button" className="btn btn-soft" style={{ padding: '8px 12px' }} onClick={() => sendUtterance(text)} disabled={busy}>
            Send
          </button>
        </div>
        <button
          type="button"
          className={`mic-btn${listening ? ' listening' : ''}`}
          onClick={toggleListen}
          aria-label={listening ? 'Stop listening' : 'Speak to Zuri'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
          </svg>
        </button>
      </div>

      {/* Standard PIN confirm (for known beneficiary transfers, goals, etc.) */}
      {pinOpen && pending && (
        <PinModal
          title="Confirm with PIN"
          subtitle={pending.reply_text}
          onClose={() => {
            setPinOpen(false);
            setPending(null);
          }}
          onConfirm={confirmPending}
        />
      )}

      {/* Step 1: Bank details input for unknown recipient */}
      {bankDetailsOpen && pending && (
        <BankDetailsModal
          title="Enter Bank Details"
          subtitle={pending.reply_text}
          amountKobo={pending.pending_action?.payload?.amount_kobo || 0}
          loading={bankDetailsLoading}
          onClose={() => {
            setBankDetailsOpen(false);
            setPending(null);
          }}
          onNext={handleBankDetailsNext}
        />
      )}

      {/* Step 2: Confirm transfer with resolved name + PIN */}
      {confirmTransferOpen && transferDetails && (
        <ConfirmTransferModal
          accountName={transferDetails.accountName}
          bankName={transferDetails.bankName}
          accountNumber={transferDetails.accountNumber}
          amountKobo={transferDetails.amountKobo}
          onClose={() => {
            setConfirmTransferOpen(false);
            setTransferDetails(null);
            setPending(null);
          }}
          onConfirm={handleConfirmTransfer}
        />
      )}

      {/* Step 3: Save as beneficiary */}
      {saveBeneOpen && transferDetails && (
        <SaveBeneficiaryModal
          accountName={transferDetails.accountName}
          defaultNickname={transferDetails.recipientRef}
          busy={saveBeneBusy}
          onSave={handleSaveBeneficiary}
          onSkip={handleSkipSaveBene}
        />
      )}

      {/* Transfer processing overlay */}
      {overlay.show && (
        <TransferOverlay
          status={overlay.status}
          message={overlay.message}
          onDone={handleOverlayDone}
        />
      )}
    </>
  );
}
