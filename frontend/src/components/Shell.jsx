import { useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { speakText } from '../lib/api.js';
import '../styles/dashboard.css';

const nav = [
  { to: '/dashboard', end: true, label: 'Home', icon: HomeIcon },
  { to: '/dashboard/goals', label: 'Goals', icon: GoalIcon },
  { to: '/dashboard/activity', label: 'Money Diary', icon: ActivityIcon },
  { to: '/dashboard/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Shell() {
  const { token, user, refreshAccount } = useAuth();
  const name = (user?.full_name || user?.name || '').split(' ')[0] || 'Account';
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!token || token === 'null' || token === 'undefined') return;

    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/events/stream?token=${encodeURIComponent(token)}`, {
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
              const speak = payload.message.spoken_text || payload.message.text;
              speakText(speak, payload.message.language, payload.message.audio_url);
              refreshAccount();
              window.dispatchEvent(
                new CustomEvent('zuri_proactive_message', { detail: payload.message }),
              );
            }
            if (payload.type === 'refresh') {
              refreshAccount();
              window.dispatchEvent(new Event('zuri_refresh'));
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

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="sidebar-logo">Zuri</div>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}
            >
              <n.icon />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/" className="sidebar-back-link">
            <BackIcon />
            <span>Go back</span>
          </Link>
          <NavLink to="/dashboard/settings" className="sidebar-user">
          <div className="sidebar-avatar">{initial}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{name}</div>
            <div className="sidebar-user-role">View profile</div>
          </div>
        </NavLink>
        </div>
      </aside>

      <main className="dashboard-main">
        <Outlet />
      </main>

      <nav className="mobile-tabbar">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `mobile-tab-link${isActive ? ' active' : ''}`}
          >
            <n.icon />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
