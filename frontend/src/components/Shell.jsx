import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/app', end: true, label: 'Talk', icon: MicIcon },
  { to: '/app/goals', label: 'Goals', icon: GoalIcon },
  { to: '/app/people', label: 'People', icon: PeopleIcon },
  { to: '/app/activity', label: 'Activity', icon: ActivityIcon },
  { to: '/app/settings', label: 'You', icon: UserIcon },
];

export default function Shell() {
  return (
    <div className="phone">
      <div className="shell">
        <div className="shell-main">
          <Outlet />
        </div>
        <nav className="tabbar" aria-label="Main">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
            >
              <t.icon />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.3" />
      <path d="M16 4.2a3.5 3.5 0 0 1 0 6.6" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 14h4l2-6 3 10 2-5h5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}
