import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira } from '../lib/api.js';
import SendMoneyModal from '../components/SendMoneyModal.jsx';
import PayBillsModal from '../components/PayBillsModal.jsx';
import AirtimeDataModal from '../components/AirtimeDataModal.jsx';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { user, account, token } = useAuth();
  const name = (user?.full_name || user?.name || '').split(' ')[0] || 'there';
  const balance = account?.balance_kobo ?? 29500000;
  const [proactiveMessages, setProactiveMessages] = useState([]);
  const feedRef = useRef(null);

  const [activeModal, setActiveModal] = useState(null);
  const [recording, setRecording] = useState(false);
  const [voiceResponse, setVoiceResponse] = useState(null);
  const [question, setQuestion] = useState('');
  const [questionBusy, setQuestionBusy] = useState(false);
  const recognitionRef = useRef(null);
  const spokenTextRef = useRef('');

  useEffect(() => {
    function onProactive(e) {
      setProactiveMessages((prev) => [...prev, e.detail]);
    }
    window.addEventListener('zuri_proactive_message', onProactive);
    return () => window.removeEventListener('zuri_proactive_message', onProactive);
  }, []);

  const submitQuestion = useCallback(async (text) => {
    if (!text || questionBusy || !token) return;
    setQuestionBusy(true);
    setVoiceResponse({ text, role: 'user' });
    setQuestion('');
    try {
      const data = await api.talk(token, text, false);
      setVoiceResponse(data.assistant_message);
    } catch (err) {
      setVoiceResponse({ text: err.message || 'I could not answer that right now.', role: 'assistant' });
    } finally {
      setQuestionBusy(false);
    }
  }, [questionBusy, token]);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceResponse({ text: 'Speech recognition is not supported in this browser.', role: 'assistant' });
      return;
    }
    const recognition = new Recognition();
    spokenTextRef.current = '';
    recognition.lang = 'en-NG';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setRecording(true);
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) spokenTextRef.current += transcript;
        else interim += transcript;
      }
      setQuestion(`${spokenTextRef.current} ${interim}`.trim());
    };
    recognition.onerror = () => {
      setRecording(false);
      setVoiceResponse({ text: 'I could not hear that. Please try again.', role: 'assistant' });
    };
    recognition.onend = () => {
      setRecording(false);
      const text = spokenTextRef.current.trim();
      if (text) submitQuestion(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function askZuri(e) {
    e.preventDefault();
    const text = question.trim();
    submitQuestion(text);
  }

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
              <span className="balance-label">Available balance</span>
              <span className="balance-amount">{formatNaira(balance)}</span>
              <span className="balance-sub">Main account</span>
            </div>
            <div className="balance-icon">
              <WalletIcon />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dash-card quick-actions">
            <button className="quick-action" type="button" onClick={() => setActiveModal('send')}>
              <div className="quick-action-icon">
                <SendIcon />
              </div>
              <span className="quick-action-label">Send money</span>
            </button>
            <button className="quick-action" type="button" onClick={() => setActiveModal('bills')}>
              <div className="quick-action-icon">
                <BillIcon />
              </div>
              <span className="quick-action-label">Pay bills</span>
            </button>
            <button className="quick-action" type="button" onClick={() => setActiveModal('airtime')}>
              <div className="quick-action-icon">
                <PhoneIcon />
              </div>
              <span className="quick-action-label">Airtime &amp; data</span>
            </button>
            <button className="quick-action" type="button" onClick={() => setActiveModal('more')}>
              <div className="quick-action-icon">
                <MoreIcon />
              </div>
              <span className="quick-action-label">More</span>
            </button>
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
              {/* User message */}
              <div className="conversation-msg user">
                <span className="conversation-msg-sender user">You</span>
                <p className="conversation-msg-text">
                  Zuri, how should I pay my rent this year? It&apos;s &#x20A6;900k due in November.
                </p>
                <span className="conversation-msg-time">10:24 AM</span>
              </div>

              {/* Zuri response */}
              <div className="conversation-msg zuri">
                <span className="conversation-msg-sender zuri">Zuri</span>
                <p className="conversation-msg-text">
                  I&apos;ve reviewed your income and spending. Here&apos;s the plan I recommend.
                </p>
              </div>

              {/* Recommendation */}
              <div className="recommendation-card">
                <div className="recommendation-top">
                  <span className="recommendation-title">Rent 2027</span>
                  <span className="recommendation-amount">{formatNaira(90000000)} target</span>
                </div>
                <span className="recommendation-detail">{formatNaira(7500000)} / month</span>
                <button className="recommendation-btn" type="button">Set up direct debit</button>
                <span className="recommendation-note">
                  Based on your recent income and spending.
                </span>
              </div>

              <div className="conversation-msg zuri">
                <span className="conversation-msg-time">10:26 AM</span>
              </div>

              {/* Proactive message */}
              <div className="conversation-msg zuri">
                <span className="conversation-msg-sender zuri">Zuri</span>
                <p className="conversation-msg-text">
                  Your salary just landed — {formatNaira(45000000)}.
                </p>
              </div>

              <div className="conversation-msg zuri">
                <p className="conversation-msg-text">
                  Here&apos;s what&apos;s already committed.
                </p>

                <div className="proactive-card">
                  <span className="proactive-label">
                    <BoltIcon />
                    Auto-committed
                  </span>
                  <div className="committed-list">
                    <div className="committed-item">
                      <span className="committed-item-name">Rent goal</span>
                      <span className="committed-item-amount">{formatNaira(7500000)}</span>
                    </div>
                    <div className="committed-item">
                      <span className="committed-item-name">Mum&apos;s monthly</span>
                      <span className="committed-item-amount">{formatNaira(2000000)}</span>
                    </div>
                    <div className="committed-item">
                      <span className="committed-item-name">Tax pot</span>
                      <span className="committed-item-amount">{formatNaira(4500000)}</span>
                    </div>
                  </div>
                  <div className="committed-summary">
                    You have {formatNaira(31000000)} available to use.
                  </div>
                </div>

                <span className="conversation-msg-time">Just now</span>
              </div>

              {voiceResponse && (
                <div className="conversation-msg zuri">
                  <span className="conversation-msg-sender zuri">Zuri</span>
                  <p className="conversation-msg-text">{voiceResponse.text}</p>
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
        <button className="voice-icon-btn" type="button" aria-label="Type a message">
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
          >
            <div className="voice-mic-ring-outer" />
            <div className="voice-mic-ring" />
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
        </div>

        <span className="voice-label">{recording ? 'Recording…' : 'Tap to speak'}</span>

        <button className="voice-icon-btn" type="button" aria-label="Conversation history">
          <ChatIcon />
        </button>
      </div>

      {activeModal === 'send' && <SendMoneyModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'bills' && <PayBillsModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'airtime' && <AirtimeDataModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'more' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal services-modal" onClick={(e) => e.stopPropagation()}>
            <div className="services-modal-header">
              <div>
                <h2>More services</h2>
                <p className="lede">Everyday money and lifestyle essentials.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setActiveModal(null)} aria-label="Close services">×</button>
            </div>
            <div className="services-grid">
              <button type="button" className="service-option" onClick={() => { setActiveModal(null); setVoiceResponse({ text: 'Sports betting funding is ready to be connected.', role: 'assistant' }); }}>
                <span className="service-option-icon"><TrophyIcon /></span>
                <span><strong>Sports betting</strong><small>Fund your wallet</small></span>
              </button>
              <button type="button" className="service-option" onClick={() => { setActiveModal(null); setVoiceResponse({ text: 'Gift cards will be available here soon.', role: 'assistant' }); }}>
                <span className="service-option-icon"><GiftIcon /></span>
                <span><strong>Gift cards</strong><small>Buy a digital card</small></span>
              </button>
              <button type="button" className="service-option" onClick={() => setActiveModal('bills')}>
                <span className="service-option-icon"><BillIcon /></span>
                <span><strong>Cable TV</strong><small>Pay a subscription</small></span>
              </button>
              <button type="button" className="service-option" onClick={() => setActiveModal('bills')}>
                <span className="service-option-icon"><BoltIcon /></span>
                <span><strong>Electricity</strong><small>Pay a bill</small></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ——— Icons ——— */

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 10H18a2 2 0 0 0 0 4h4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BillIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8H8.5a2.5 2.5 0 1 1 2.5-2.5V8zM12 8h3.5a2.5 2.5 0 1 0-2.5-2.5V8z" />
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
