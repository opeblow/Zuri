import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, speakText } from '../lib/api.js';
import PinModal from '../components/PinModal.jsx';

const SUGGESTIONS = [
  'How should I pay my rent this year? It\'s ₦900k due in November.',
  'Send ₦5,000 to Mummy',
  'Ṣé mo ní owó tí mo lè fi rá phone tuntun báyìí?',
  'How much have I spent on Bolt this month?',
  'What\'s my balance?',
];

export default function Home() {
  const { token, account, refreshAccount, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const feedRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    api.history(token).then((d) => setMessages(d.messages || []));
  }, [token]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // SSE for proactive salary moment
  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/events/stream', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';
        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const payload = JSON.parse(line.slice(6));
            if (payload.type === 'proactive_message' && payload.message) {
              setMessages((m) => [...m, { ...payload.message, proactive: true }]);
              speakText(payload.message.text, payload.message.language);
              refreshAccount();
            }
          }
        }
      } catch {
        /* stream closed */
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [token, refreshAccount]);

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
      const data = await api.talk(token, clean);
      setMessages((m) => [...m, data.message]);
      speakText(data.decision.reply_text, data.decision.language);

      if (data.decision.requires_confirmation && data.decision.pending_action) {
        setPending(data.decision);
        setPinOpen(true);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'zuri',
          text: err.message || 'Something went quiet on my end.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending(pin) {
    if (!pending?.pending_action) return;
    const { type, payload } = pending.pending_action;
    if (type === 'transfer') {
      const result = await api.transfer(token, {
        pin,
        beneficiary_id: payload.beneficiary_id,
        amount_kobo: payload.amount_kobo,
      });
      const spoken = result.spoken;
      setMessages((m) => [
        ...m,
        {
          id: `ok-${Date.now()}`,
          role: 'zuri',
          text: spoken,
          intent: 'transfer_success',
          created_at: new Date().toISOString(),
        },
      ]);
      speakText(spoken);
      await refreshAccount();
    } else if (type === 'create_goal_mandate') {
      const result = await api.createGoal(token, { ...payload, pin });
      const spoken = result.spoken;
      setMessages((m) => [
        ...m,
        {
          id: `ok-${Date.now()}`,
          role: 'zuri',
          text: spoken,
          intent: 'goal_created',
          created_at: new Date().toISOString(),
        },
      ]);
      speakText(spoken);
    }
    setPending(null);
    setPinOpen(false);
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
      // proactive message arrives via SSE; also refresh history as fallback
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
        <div className="balance-pill">{account?.balance_display || '—'}</div>
      </header>

      <div className="demo-bar">
        <span>Demo Moment 2 — salary webhook</span>
        <button type="button" onClick={fireSalary} disabled={busy}>
          Fire salary
        </button>
      </div>

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
    </>
  );
}
