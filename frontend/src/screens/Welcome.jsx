import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function Welcome() {
  const { token } = useAuth();
  if (token) return <Navigate to="/dashboard" replace />;

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
      </div>
    </section>
  );
}
