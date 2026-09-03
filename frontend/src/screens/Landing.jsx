import { Link } from 'react-router-dom';
import '../styles/landing.css';

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const audioWaveHeights = [4, 7, 10, 6, 12, 8, 11, 5, 9, 13, 7, 10, 6, 8, 12, 5, 9, 11, 7, 10, 4, 8, 13, 6, 9, 11, 5, 7, 10, 8, 12, 6, 9, 4, 11, 7, 10, 13, 5, 8];

export default function Landing() {
  return (
    <div className="landing-page">
      {/* ——— Header ——— */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-logo">Zuri</Link>
          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#security">Security</a>
            <a href="#blog">Blog</a>
          </nav>
          <Link to="/dashboard" className="landing-cta">Get started</Link>
        </div>
      </header>

      {/* ——— Hero ——— */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero-grid">
            <div className="landing-hero-content">
              <h1 className="landing-hero-headline">
                Your money,<br />
                out <span className="accent">loud.</span>
              </h1>
              <p className="landing-hero-sub">
                Talk to your money. Ask questions, make plans and take action — naturally.
              </p>
              <div className="landing-hero-points">
                <div className="landing-hero-point">
                  <span className="dot" />
                  Speak in English, Yoruba or Pidgin
                </div>
                <div className="landing-hero-point">
                  <span className="dot" />
                  Understand your spending in real time
                </div>
                <div className="landing-hero-point">
                  <span className="dot" />
                  Confirm every money movement before it happens
                </div>
              </div>
            </div>

            <div className="landing-phone-wrap">
              <div className="landing-phone">
                <div className="landing-phone-notch" />
                <div className="landing-phone-status">
                  <span>9:41</span>
                  <span>100%</span>
                </div>
                <div className="landing-phone-header">
                  <span className="landing-phone-brand">Zuri</span>
                  <span className="landing-phone-bal">₦482,310.00</span>
                </div>

                <div className="landing-phone-chat">
                  <div className="landing-phone-msg user-msg">
                    Zuri, how should I pay my rent this year? It&apos;s ₦900k due in November.
                  </div>
                  <div className="landing-phone-msg zuri-msg">
                    I&apos;ve reviewed your income and spending. Here&apos;s a plan I recommend.
                  </div>
                  <div className="landing-phone-card">
                    <div className="landing-phone-card-label">Rent goal</div>
                    <div className="landing-phone-card-amount">₦900,000</div>
                    <div className="landing-phone-card-sub">₦75,000 / month until November</div>
                    <div className="landing-phone-card-btn">
                      Set up direct debit
                    </div>
                  </div>
                </div>

                <div className="landing-phone-voice">
                  <div className="landing-phone-waveform">
                    {Array.from({ length: 12 }, (_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                  <div className="landing-phone-mic">
                    <MicIcon />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Audio Demo ——— */}
      <section className="landing-demo" id="how-it-works">
        <div className="landing-container">
          <div className="landing-demo-grid">
            <div>
              <h2 className="landing-demo-heading">See how Zuri works</h2>
              <p className="landing-demo-sub">Ask a question. Hear Zuri think.</p>
            </div>
            <div className="landing-audio-player">
              <button className="landing-audio-play" aria-label="Play demo">
                <PlayIcon />
              </button>
              <div className="landing-audio-track">
                <div className="landing-audio-wave">
                  {audioWaveHeights.map((h, i) => (
                    <span
                      key={i}
                      className={i < 16 ? 'active' : ''}
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
                <div className="landing-audio-meta">
                  <span>0:12 / 0:34</span>
                </div>
              </div>
              <span className="landing-audio-label">Transcript</span>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Features ——— */}
      <section className="landing-features" id="features">
        <div className="landing-container">
          <div className="landing-features-grid">
            <div className="landing-feature">
              <div className="landing-feature-num">01</div>
              <h3 className="landing-feature-title">Talk naturally</h3>
              <p className="landing-feature-desc">
                English, Yoruba and Pidgin. Speak the way you think — Zuri understands context, not just keywords.
              </p>
            </div>
            <div className="landing-feature">
              <div className="landing-feature-num">02</div>
              <h3 className="landing-feature-title">Understand your money</h3>
              <p className="landing-feature-desc">
                Zuri reasons over your balance, transactions, goals and saved beneficiaries to give you real answers.
              </p>
            </div>
            <div className="landing-feature">
              <div className="landing-feature-num">03</div>
              <h3 className="landing-feature-title">Act safely</h3>
              <p className="landing-feature-desc">
                Every money movement requires confirmation. Zuri suggests, you decide. Nothing happens without your approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Security ——— */}
      <section className="landing-security" id="security">
        <div className="landing-container">
          <div className="landing-security-grid">
            <div className="landing-security-content">
              <h2 className="landing-security-heading">Your money is protected</h2>
              <p className="landing-security-sub">
                Every transaction requires your approval. Zuri suggests, you decide.
              </p>
            </div>
            <div className="landing-security-points">
              <div className="landing-security-point">
                <div className="landing-security-point-icon">
                  <LockIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">PIN-protected actions</h4>
                  <p className="landing-security-point-desc">
                    Every send, withdrawal and account change requires your 4-digit PIN. No exceptions.
                  </p>
                </div>
              </div>
              <div className="landing-security-point">
                <div className="landing-security-point-icon">
                  <ShieldIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">Confirmation before execution</h4>
                  <p className="landing-security-point-desc">
                    Zuri never moves money on its own. You review and confirm every action before it happens.
                  </p>
                </div>
              </div>
              <div className="landing-security-point">
                <div className="landing-security-point-icon">
                  <EyeIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">Real-time notifications</h4>
                  <p className="landing-security-point-desc">
                    Know instantly when money moves. Every transaction is logged and visible in your history.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Blog / Latest Insights ——— */}
      <section className="landing-blog" id="blog">
        <div className="landing-container">
          <div className="landing-blog-header">
            <h2 className="landing-blog-heading">Latest Insights</h2>
            <p className="landing-blog-sub">Thoughts on building financial products for Africa.</p>
          </div>
          <div className="landing-blog-grid">
            <div className="landing-blog-card">
              <span className="landing-blog-card-cat">Product</span>
              <h3 className="landing-blog-card-title">Conversational Banking in Africa</h3>
              <span className="landing-blog-card-date">August 2026</span>
            </div>
            <div className="landing-blog-card">
              <span className="landing-blog-card-cat">Security</span>
              <h3 className="landing-blog-card-title">Zero-Trust Security Gates</h3>
              <span className="landing-blog-card-date">August 2026</span>
            </div>
            <div className="landing-blog-card">
              <span className="landing-blog-card-cat">Engineering</span>
              <h3 className="landing-blog-card-title">Multi-Language NLU</h3>
              <span className="landing-blog-card-date">July 2026</span>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-grid">
            <div className="landing-footer-brand">
              <div className="landing-footer-logo">Zuri</div>
              <p className="landing-footer-tagline">
                Your money, out loud. Talk to your money in the language you already speak.
              </p>
            </div>
            <div className="landing-footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How it works</a></li>
                <li><a href="#security">Security</a></li>
                <li><a href="#">Pricing</a></li>
              </ul>
            </div>
            <div className="landing-footer-col">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#blog">Blog</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Press</a></li>
              </ul>
            </div>
            <div className="landing-footer-col">
              <h4>Support</h4>
              <ul>
                <li><a href="#">Help Centre</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Status</a></li>
                <li><a href="#">Developers</a></li>
              </ul>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span>&copy; 2026 Zuri. All rights reserved.</span>
            <div className="landing-footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
