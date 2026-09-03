import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function Welcome() {
  const { token, login } = useAuth();
  if (token) return <Navigate to="/app" replace />;

  async function demoLogin() {
    await api.resetDemo();
    await login('08012345678', '1234');
  }

  return (
    <section className="hero-screen">
      <div className="orb" aria-hidden />
      <div className="orb second" aria-hidden />
      <h1 className="hero-brand">Zuri</h1>
      <p className="hero-tag">Your money, out loud.</p>
      <div className="hero-actions">
        <Link className="btn btn-primary" to="/onboarding" style={{ textAlign: 'center' }}>
          Open an account
        </Link>
        <button type="button" className="btn btn-ghost" onClick={demoLogin}>
          Enter demo (Amina)
        </button>
      </div>
    </section>
  );
}
