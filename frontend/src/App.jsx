import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthContext.jsx';
import Shell from './components/Shell.jsx';
import Welcome from './screens/Welcome.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Goals from './screens/Goals.jsx';
import Beneficiaries from './screens/Beneficiaries.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';

function Private({ children }) {
  const { token, booting } = useAuth();
  if (booting) {
    return (
      <div className="boot">
        <div className="boot-mark">Zuri</div>
        <p>Waking your money up…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app-frame">
      <div className="phone-glow" aria-hidden />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/app"
          element={
            <Private>
              <Shell />
            </Private>
          }
        >
          <Route index element={<Home />} />
          <Route path="goals" element={<Goals />} />
          <Route path="people" element={<Beneficiaries />} />
          <Route path="activity" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
