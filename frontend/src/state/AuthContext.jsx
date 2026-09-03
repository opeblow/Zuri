import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('zuri_token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zuri_user') || 'null');
    } catch {
      return null;
    }
  });
  const [account, setAccount] = useState(null);
  const [booting, setBooting] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .account(token)
      .then(setAccount)
      .catch(() => {
        logout();
      })
      .finally(() => setBooting(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const eventSource = new EventSource(`/api/events/stream?token=${token}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'proactive_message') {
          window.dispatchEvent(new CustomEvent('zuri_proactive_message', { detail: data.message }));
        } else if (data.type === 'refresh') {
          api.account(token).then(setAccount).catch(console.error);
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [token]);

  function persist(nextToken, nextUser) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem('zuri_token', nextToken);
    localStorage.setItem('zuri_user', JSON.stringify(nextUser));
  }

  function logout() {
    setToken(null);
    setUser(null);
    setAccount(null);
    localStorage.removeItem('zuri_token');
    localStorage.removeItem('zuri_user');
  }

  async function login(phone, pin) {
    const data = await api.login(phone, pin);
    persist(data.token, data.user);
    const acc = await api.account(data.token);
    setAccount(acc);
    return data;
  }

  async function signup(payload) {
    const data = await api.signup(payload);
    persist(data.token, data.user);
    setAccount({
      reserved_account: data.account.reserved_account,
      bank_name: data.account.bank_name,
      balance_kobo: data.account.balance_kobo,
      balance_display: formatLocal(data.account.balance_kobo),
      monthly_summary: { inflow_kobo: 0, outflow_kobo: 0 },
    });
    return data;
  }

  async function refreshAccount() {
    if (!token) return;
    const acc = await api.account(token);
    setAccount(acc);
    return acc;
  }

  const value = useMemo(
    () => ({ token, user, account, booting, login, signup, logout, refreshAccount, setUser }),
    [token, user, account, booting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function formatLocal(kobo) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format((kobo || 0) / 100);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
