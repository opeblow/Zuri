import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal.jsx';
import '../styles/landing.css';

const CATEGORY_BARS = [
  { label: 'Rent', pct: 62, color: '#131313' },
  { label: 'Transport', pct: 34, color: '#4FC3E8' },
  { label: 'Lifestyle', pct: 21, color: '#E05B4E' },
];

function useCountUp(target, active, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

function PhoneMock() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const balance = useCountUp(184300, visible, 1300);

  return (
    <div className={`landing-phone-wrap reveal${visible ? ' is-visible' : ''}`} ref={ref} style={{ transitionDelay: '180ms' }}>
      <div className="landing-phone">
        <div className="landing-phone-status">
          <span>9:41</span>
          <span>Zuri</span>
        </div>

        <div className="landing-phone-balance-card">
          <div className="landing-phone-balance-label">Diary balance</div>
          <div className="landing-phone-balance-amount">₦{balance.toLocaleString()}</div>
        </div>

        <div className="landing-phone-tiles">
          <div className="landing-phone-tile">
            <div className="landing-phone-tile-label">Runway</div>
            <div className="landing-phone-tile-value">12d</div>
          </div>
          <div className="landing-phone-tile">
            <div className="landing-phone-tile-label">This week</div>
            <div className="landing-phone-tile-value">₦31,200</div>
          </div>
        </div>

        <div className="landing-phone-bars">
          {CATEGORY_BARS.map((c) => (
            <div className="landing-phone-bar-row" key={c.label}>
              <span className="landing-phone-bar-label">{c.label}</span>
              <div className="landing-phone-bar-track">
                <div
                  className="landing-phone-bar-fill"
                  style={{ width: visible ? `${c.pct}%` : '0%', background: c.color }}
                />
              </div>
              <span className="landing-phone-bar-amount">{c.pct}%</span>
            </div>
          ))}
        </div>

        <div className="landing-phone-msg">
          <strong>Zuri:</strong> Netflix charged you again — that's 3 months running, ₦3,900 each time.
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing-page">
      {/* ——— Header ——— */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-logo">Zuri</Link>
          <nav className="landing-nav">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#security">Security</a>
          </nav>
          <Link to="/onboarding" className="landing-cta">Get started</Link>
        </div>
      </header>

      {/* ——— Hero ——— */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero-grid">
            <div>
              <Reveal as="h1" className="landing-hero-headline">
                Your money,<br />
                out <span className="accent">loud.</span>
              </Reveal>
              <Reveal as="p" delay={80} className="landing-hero-sub">
                Zuri isn't a bank — it's a voice-native money diary. Tell it what you earn and
                spend, and it tracks the rest: runway, patterns, and warnings, spoken back to you.
              </Reveal>
              <Reveal delay={160} className="landing-hero-points">
                <div className="landing-hero-point">
                  <span className="dot" />
                  Speak in English, Yoruba, Igbo, Hausa or Pidgin
                </div>
                <div className="landing-hero-point">
                  <span className="dot" />
                  See exactly how many days your balance covers
                </div>
                <div className="landing-hero-point">
                  <span className="dot" />
                  No bank connection — nothing to sync, nothing to hack
                </div>
              </Reveal>
              <Reveal delay={240} className="landing-hero-actions">
                <Link to="/onboarding" className="landing-hero-primary-cta">Start my money diary</Link>
                <a href="#how-it-works" className="landing-hero-secondary-cta">See how it works</a>
              </Reveal>
            </div>

            <PhoneMock />
          </div>
        </div>
      </section>

      {/* ——— How it works ——— */}
      <section className="landing-how" id="how-it-works">
        <div className="landing-container">
          <Reveal className="landing-section-head">
            <span className="landing-section-eyebrow">How it works</span>
            <h2 className="landing-section-heading">Three steps. No forms, no bank login.</h2>
            <p className="landing-section-sub">
              Everything Zuri knows, it knows because you told it. That's the whole trust model.
            </p>
          </Reveal>
          <div className="landing-how-grid">
            <Reveal className="landing-how-step">
              <div className="landing-how-step-num">01</div>
              <h3 className="landing-how-step-title">Tell Zuri</h3>
              <p className="landing-how-step-desc">
                Say or type what happened — "just got paid 200k" or "spent 3k on fuel."
              </p>
            </Reveal>
            <Reveal delay={100} className="landing-how-step">
              <div className="landing-how-step-num">02</div>
              <h3 className="landing-how-step-title">Zuri logs it</h3>
              <p className="landing-how-step-desc">
                Categorised and added to your diary instantly — no forms, no menus to dig through.
              </p>
            </Reveal>
            <Reveal delay={200} className="landing-how-step">
              <div className="landing-how-step-num">03</div>
              <h3 className="landing-how-step-title">Zuri talks back</h3>
              <p className="landing-how-step-desc">
                Trends, recurring charges, odd spikes, and runway — narrated out loud, in your language.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ——— Features ——— */}
      <section className="landing-features" id="features">
        <div className="landing-container">
          <div className="landing-features-grid">
            <Reveal className="landing-feature">
              <div className="landing-feature-num">01</div>
              <h3 className="landing-feature-title">Talk naturally</h3>
              <p className="landing-feature-desc">
                English, Pidgin, Yoruba, Igbo or Hausa — voice in, voice out. Zuri understands context, not just keywords.
              </p>
            </Reveal>
            <Reveal delay={100} className="landing-feature">
              <div className="landing-feature-num">02</div>
              <h3 className="landing-feature-title">See your real runway</h3>
              <p className="landing-feature-desc">
                Not just a balance — a burn rate and a day count, so "how long will this last" has an actual answer.
              </p>
            </Reveal>
            <Reveal delay={200} className="landing-feature">
              <div className="landing-feature-num">03</div>
              <h3 className="landing-feature-title">Catch what you'd miss</h3>
              <p className="landing-feature-desc">
                Recurring charges and spending spikes get flagged automatically — before they quietly add up.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ——— Security / trust ——— */}
      <section className="landing-security" id="security">
        <div className="landing-container">
          <div className="landing-security-grid">
            <Reveal>
              <h2 className="landing-security-heading">Nothing to hack, because nothing's connected.</h2>
              <p className="landing-security-sub">
                Zuri never asks for your bank login and never touches a real account. Your diary is
                exactly as private as what you choose to tell it.
              </p>
            </Reveal>
            <div className="landing-security-points">
              <Reveal className="landing-security-point">
                <div className="landing-security-point-icon">
                  <LockIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">No bank connection</h4>
                  <p className="landing-security-point-desc">
                    There's no account to link and no credentials to hand over — Zuri only knows what you log.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={90} className="landing-security-point">
                <div className="landing-security-point-icon">
                  <ShieldIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">PIN-locked diary</h4>
                  <p className="landing-security-point-desc">
                    A 4-digit PIN guards your account. It's never seen by the AI model.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={180} className="landing-security-point">
                <div className="landing-security-point-icon">
                  <EyeIcon />
                </div>
                <div>
                  <h4 className="landing-security-point-title">You control the data</h4>
                  <p className="landing-security-point-desc">
                    Reset or delete your demo data anytime from Settings — nothing lingers you didn't ask for.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Final CTA ——— */}
      <section className="landing-final-cta">
        <div className="landing-container">
          <Reveal as="h2" className="landing-final-cta-heading">Start telling Zuri what's going on with your money.</Reveal>
          <Reveal as="p" delay={90} className="landing-final-cta-sub">Takes under a minute. No bank details required.</Reveal>
          <Reveal delay={180}>
            <Link to="/onboarding" className="landing-final-cta-btn">Start my money diary</Link>
          </Reveal>
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div>
            <div className="landing-footer-brand">Zuri</div>
            <p className="landing-footer-tagline">Your money, out loud.</p>
          </div>
          <span className="landing-footer-meta">&copy; 2026 Zuri — built for APIConf Hackathon</span>
        </div>
      </footer>
    </div>
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
