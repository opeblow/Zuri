import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira, speakText } from '../lib/api.js';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const CATEGORY_COLORS = ['#131313', '#12A36C', '#4FC3E8', '#C9A227', '#E05B4E', '#9C9A90'];
const LOG_CATEGORIES = ['transport', 'lifestyle', 'bills', 'shopping', 'other'];

export default function Home() {
  const { user, account, token, refreshAccount } = useAuth();
  const name = (user?.full_name || user?.name || '').split(' ')[0] || 'there';
  const balance = account?.balance_kobo ?? 0;
  const [hideBalance, setHideBalance] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logDirection, setLogDirection] = useState('debit');
  const [logAmount, setLogAmount] = useState('');
  const [logCategory, setLogCategory] = useState('other');
  const [logNote, setLogNote] = useState('');
  const [logBusy, setLogBusy] = useState(false);
  const [proactiveMessages, setProactiveMessages] = useState([]);
  const [insights, setInsights] = useState(null);
  const feedRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [liveCaption, setLiveCaption] = useState('');
  const [question, setQuestion] = useState('');
  const [questionBusy, setQuestionBusy] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognitionRef = useRef(null);
  const msgIdRef = useRef(0);
  const questionInputRef = useRef(null);

  function pushMessage(role, text) {
    const id = ++msgIdRef.current;
    setMessages((prev) => [...prev, { id, role, text, time: new Date() }]);
    return id;
  }

  function updateMessage(id, text) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }

  useEffect(() => {
    if (!token) return;
    api.conversationHistory(token)
      .then((data) => {
        const loaded = (data.messages || []).map((m) => ({
          id: ++msgIdRef.current,
          role: m.role,
          text: m.text.startsWith('[Audio] ') ? m.text.slice(8) : m.text,
          time: new Date(m.timestamp),
        }));
        setMessages(loaded);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadInsights = useCallback(async () => {
    if (!token) {
      setInsights(null);
      return;
    }
    try {
      const data = await api.insights(token);
      setInsights(data);
    } catch {
      setInsights(null);
    }
  }, [token]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  useEffect(() => {
    function onProactive(e) {
      setProactiveMessages((prev) => [...prev, e.detail]);
      loadInsights();
    }
    function onRefresh() {
      loadInsights();
    }
    window.addEventListener('zuri_proactive_message', onProactive);
    window.addEventListener('zuri_refresh', onRefresh);
    return () => {
      window.removeEventListener('zuri_proactive_message', onProactive);
      window.removeEventListener('zuri_refresh', onRefresh);
    };
  }, [loadInsights]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, liveCaption, recording]);

  function playReply(assistantMessage) {
    if (!assistantMessage) return;
    speakText(assistantMessage.text, undefined, assistantMessage.audio_base64 || null);
  }

  const submitQuestion = useCallback(async (text) => {
    if (!text || questionBusy || !token) return;
    setQuestionBusy(true);
    pushMessage('user', text);
    setQuestion('');
    try {
      const data = await api.talk(token, text, true);
      pushMessage('assistant', data.assistant_message.text);
      playReply(data.assistant_message);
      loadInsights();
    } catch (err) {
      pushMessage('assistant', err.message || 'I could not answer that right now.');
    } finally {
      setQuestionBusy(false);
    }
  }, [questionBusy, token, loadInsights]);

  const sendVoiceClip = useCallback(async (blob) => {
    if (!token) return;
    setQuestionBusy(true);
    const pendingId = pushMessage('user', 'Transcribing…');
    try {
      const data = await api.talkAudio(token, blob);
      updateMessage(pendingId, data.transcription || '(no speech detected)');
      pushMessage('assistant', data.assistant_message.text);
      playReply(data.assistant_message);
      loadInsights();
    } catch (err) {
      updateMessage(pendingId, '(could not transcribe)');
      pushMessage('assistant', err.message || 'I could not hear that clearly. Please try again.');
    } finally {
      setQuestionBusy(false);
    }
  }, [token, loadInsights]);

  function startLiveCaption() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-NG';
      recognition.onresult = (e) => {
        let transcript = '';
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setLiveCaption(transcript.trim());
      };
      recognition.onerror = () => {};
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  }

  function stopLiveCaption() {
    try {
      speechRecognitionRef.current?.stop();
    } catch {
      /* no-op */
    }
    speechRecognitionRef.current = null;
    setLiveCaption('');
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      pushMessage('assistant', 'Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        stopLiveCaption();
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size > 0) sendVoiceClip(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      startLiveCaption();
    } catch {
      pushMessage('assistant', 'I need microphone access to listen. Please allow it and try again.');
    }
  }

  function askZuri(e) {
    e.preventDefault();
    const text = question.trim();
    submitQuestion(text);
  }

  async function submitLog(e) {
    e.preventDefault();
    if (!token) return;
    const kobo = Math.round(parseFloat(logAmount) * 100);
    if (!kobo || kobo <= 0) return;
    setLogBusy(true);
    try {
      await api.logTransaction(token, {
        direction: logDirection,
        amount_kobo: kobo,
        category: logDirection === 'credit' ? 'income' : logCategory,
        note: logNote.trim() || undefined,
      });
      await refreshAccount();
      loadInsights();
      setLogOpen(false);
      setLogAmount('');
      setLogNote('');
    } catch (err) {
      setVoiceResponse({ text: err.message || 'Could not log that. Please try again.', role: 'assistant' });
    } finally {
      setLogBusy(false);
    }
  }

  const alerts = insights ? [
    ...insights.recurring_charges.slice(0, 2).map((r) => ({
      type: 'recurring',
      key: `rec-${r.name}`,
      label: r.name,
      detail: `${r.avg_amount_display} roughly every ${r.avg_interval_days} days`,
    })),
    ...insights.anomalies.slice(0, 2).map((a) => ({
      type: 'anomaly',
      key: `anom-${a.id}`,
      label: a.counterparty_name || a.category,
      detail: `${a.amount_display} is well above your usual ${formatNaira(a.category_avg_kobo)} for ${a.category}`,
    })),
    ...insights.goals_at_risk.map((g) => ({
      type: 'goal_risk',
      key: `goal-${g.goal_id}`,
      label: g.name,
      detail: g.message,
    })),
  ] : [];

  return (
    <>
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-greeting">{getGreeting()}, {name}</h1>
          <p className="dashboard-greeting-sub">How can I help you today?</p>
        </div>
        <div className="dashboard-header-actions">
          <button className="security-pill" type="button">
            <ShieldIcon />
            Protect your account
          </button>
          <button className="icon-btn" type="button" aria-label="Notifications">
            <BellIcon />
          </button>
        </div>
      </div>

      <div className="dashboard-scroll">
        <div className="dashboard-content">

          {/* Balance */}
          <div className="dash-card balance-card">
            <div className="balance-info">
              <span className="balance-label">
                Available balance
                <button
                  type="button"
                  className="balance-eye"
                  aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
                  onClick={() => setHideBalance((h) => !h)}
                >
                  {hideBalance ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </span>
              <span className="balance-amount">{hideBalance ? '••••••' : formatNaira(balance)}</span>
              <span className="balance-sub">Your money diary — logged, not synced from a bank</span>
              <button
                className="btn btn-primary balance-topup"
                type="button"
                onClick={() => setLogOpen((o) => !o)}
              >
                <PlusIcon /> Log income or expense
              </button>
            </div>
            <div className="balance-icon">
              <WalletIcon />
            </div>

            {logOpen && (
              <form className="quick-log-panel" onSubmit={submitLog}>
                <div className="quick-log-segmented">
                  <button
                    type="button"
                    className={`quick-log-seg${logDirection === 'debit' ? ' active' : ''}`}
                    onClick={() => setLogDirection('debit')}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    className={`quick-log-seg${logDirection === 'credit' ? ' active' : ''}`}
                    onClick={() => setLogDirection('credit')}
                  >
                    Income
                  </button>
                </div>
                <input
                  className="quick-log-amount"
                  value={logAmount}
                  onChange={(e) => setLogAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Amount (₦)"
                  inputMode="decimal"
                  autoFocus
                />
                {logDirection === 'debit' && (
                  <select className="quick-log-category" value={logCategory} onChange={(e) => setLogCategory(e.target.value)}>
                    {LOG_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                )}
                <input
                  className="quick-log-note"
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                  placeholder="Note (optional)"
                />
                <div className="quick-log-actions">
                  <button type="button" className="btn btn-soft" onClick={() => setLogOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={logBusy || !logAmount}>
                    {logBusy ? 'Logging…' : 'Log it'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Spend Intelligence */}
          <div className="dash-card insights-card">
            <div className="insights-card-header">
              <span className="insights-card-title">Spend intelligence</span>
              <span className="insights-card-sub">Computed from your real transactions</span>
            </div>

            {!insights || (insights.period.this_month_spend_kobo === 0 && insights.category_breakdown.length === 0) ? (
              <p className="insights-empty">
                No entries yet — log an expense or income above and Zuri will start tracking your patterns.
              </p>
            ) : (
              <>
                <div className="insights-grid">
                  <div className="insight-tile">
                    <span className="insight-tile-label">Runway</span>
                    <span className="insight-tile-value">
                      {insights.burn_rate.runway_days != null ? `${insights.burn_rate.runway_days}d` : '—'}
                    </span>
                    <span className="insight-tile-sub">{insights.burn_rate.daily_avg_display}/day burn</span>
                  </div>
                  <div className="insight-tile">
                    <span className="insight-tile-label">This week</span>
                    <span className="insight-tile-value">{formatNaira(insights.period.this_week_spend_kobo)}</span>
                    <span className={`insight-trend-badge ${insights.period.week_change_pct > 0 ? 'up' : 'down'}`}>
                      {insights.period.week_change_pct > 0 ? '▲' : '▼'} {Math.abs(insights.period.week_change_pct)}% vs last week
                    </span>
                  </div>
                  <div className="insight-tile">
                    <span className="insight-tile-label">This month</span>
                    <span className="insight-tile-value">{formatNaira(insights.period.this_month_spend_kobo)}</span>
                    <span className={`insight-trend-badge ${insights.period.month_change_pct > 0 ? 'up' : 'down'}`}>
                      {insights.period.month_change_pct > 0 ? '▲' : '▼'} {Math.abs(insights.period.month_change_pct)}% vs last month
                    </span>
                  </div>
                </div>

                {insights.category_breakdown.length > 0 && (
                  <div className="category-bars">
                    {insights.category_breakdown.slice(0, 5).map((c, i) => (
                      <div className="category-bar-row" key={c.category}>
                        <span className="category-bar-dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        <span className="category-bar-label">{c.category}</span>
                        <div className="category-bar-track">
                          <div
                            className="category-bar-fill"
                            style={{ width: `${c.pct}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                          />
                        </div>
                        <span className="category-bar-amount">{c.amount_display}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Conversation */}
          <div className="dash-card conversation-card">
            <div className="conversation-header">
              <div className="conversation-header-avatar">
                <ZuriIcon />
              </div>
              <span className="conversation-header-title">Zuri</span>
              <span className="conversation-header-status" />
            </div>

            <div className="conversation-feed" ref={feedRef}>
              {messages.length === 0 && !recording && (
                <div className="conversation-msg zuri">
                  <span className="conversation-msg-sender zuri">Zuri</span>
                  <p className="conversation-msg-text">
                    Hi{name !== 'there' ? ` ${name}` : ''}! Tell me what you earned or spent, or ask
                    how your money is looking — I'm listening.
                  </p>
                </div>
              )}

              {messages.map((m) => (
                <div className={`conversation-msg ${m.role === 'user' ? 'user' : 'zuri'}`} key={m.id}>
                  <span className={`conversation-msg-sender ${m.role === 'user' ? 'user' : 'zuri'}`}>
                    {m.role === 'user' ? 'You' : 'Zuri'}
                  </span>
                  <p className="conversation-msg-text">{m.text}</p>
                  <span className="conversation-msg-time">
                    {m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}

              {recording && (
                <div className="conversation-msg user live-caption">
                  <span className="conversation-msg-sender user">You</span>
                  <p className="conversation-msg-text">
                    {liveCaption || <em>Listening…</em>}
                  </p>
                </div>
              )}

              {alerts.length > 0 && (
                <div className="conversation-msg zuri">
                  <span className="conversation-msg-sender zuri">Zuri</span>
                  <p className="conversation-msg-text">
                    Here&apos;s what I&apos;m noticing in your spending right now.
                  </p>

                  <div className="proactive-card">
                    <span className="proactive-label">
                      <BoltIcon />
                      Live alerts
                    </span>
                    <div className="committed-list">
                      {alerts.map((a) => (
                        <div className="committed-item" key={a.key}>
                          <span className="committed-item-name">{a.label}</span>
                          <span className="committed-item-amount alert-detail">{a.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Ask Zuri */}
      <form className="ask-zuri-bar" onSubmit={askZuri}>
        <KeyboardIcon />
        <input
          ref={questionInputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Zuri about your spending"
          aria-label="Ask Zuri about your spending"
          disabled={questionBusy || !token}
        />
        <button className="ask-zuri-submit" type="submit" disabled={!question.trim() || questionBusy || !token}>
          {questionBusy ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {/* Voice Bar */}
      <div className="voice-bar">
        <button
          className="voice-icon-btn"
          type="button"
          aria-label="Type a message"
          onClick={() => questionInputRef.current?.focus()}
        >
          <KeyboardIcon />
        </button>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="voice-waveform">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <button
            className={`voice-mic${recording ? ' recording' : ''}`}
            type="button"
            aria-label={recording ? 'Stop recording' : 'Tap to speak'}
            onClick={toggleRecording}
            disabled={questionBusy && !recording}
          >
            <div className="voice-mic-ring-outer" />
            <div className="voice-mic-ring" />
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
        </div>

        <span className="voice-label">{recording ? 'Listening…' : questionBusy ? 'Thinking…' : 'Tap to speak'}</span>

        <button
          className="voice-icon-btn"
          type="button"
          aria-label="Conversation history"
          onClick={() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          <ChatIcon />
        </button>
      </div>
    </>
  );
}

/* ——— Icons ——— */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 10H18a2 2 0 0 0 0 4h4" />
    </svg>
  );
}

function ZuriIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="6" y1="8" x2="6.01" y2="8" />
      <line x1="10" y1="8" x2="10.01" y2="8" />
      <line x1="14" y1="8" x2="14.01" y2="8" />
      <line x1="18" y1="8" x2="18.01" y2="8" />
      <line x1="6" y1="12" x2="6.01" y2="12" />
      <line x1="10" y1="12" x2="10.01" y2="12" />
      <line x1="14" y1="12" x2="14.01" y2="12" />
      <line x1="18" y1="12" x2="18.01" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
