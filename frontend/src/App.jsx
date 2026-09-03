import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/AuthContext.jsx';
import Shell from './components/Shell.jsx';
import Landing from './screens/Landing.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Goals from './screens/Goals.jsx';
import Beneficiaries from './screens/Beneficiaries.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Private({ children }) {
  const { booting, token } = useAuth();
  if (booting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="boot">
          <div className="boot-mark">Zuri</div>
          <p>Waking your money up…</p>
        </div>
      </div>
    );
  }
  if (!token) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  const isFullBleed = pathname === '/' || pathname.startsWith('/dashboard') || pathname === '/onboarding';

  return (
    <div className={isFullBleed ? undefined : 'app-frame'}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/dashboard"
          element={
            <Private>
              <Shell />
            </Private>
          }
        >
          <Route index element={<Home />} />
          <Route path="goals" element={<Goals />} />
          <Route path="beneficiaries" element={<Beneficiaries />} />
          <Route path="activity" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
