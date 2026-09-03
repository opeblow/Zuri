const API = import.meta.env.VITE_API_URL || '/api';

export class AuthError extends Error {
  constructor(message = 'Session expired. Please log in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

function freshToken() {
  const t = localStorage.getItem('zuri_token') || localStorage.getItem('token') || localStorage.getItem('access_token') || '';
  return t && t !== 'undefined' && t !== 'null' ? t : '';
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function authHeaders(token, extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function request(path, { token, method = 'GET', body, requireAuth = false, extraHeaders = {} } = {}) {
  const effectiveToken = token || freshToken();
  if (requireAuth && !effectiveToken) {
    throw new AuthError();
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(effectiveToken, extraHeaders),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AuthError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error || data.message || data.detail || 'Request failed';
    if (typeof msg === 'object') {
      msg = Array.isArray(msg) ? msg.map(e => e.message || JSON.stringify(e)).join(', ') : JSON.stringify(msg);
    }
    throw new Error(msg);
  }
  return data;
}

export const api = {
  login: (phone, pin) => request('/auth/login', { method: 'POST', body: { phone, pin } }),
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  verifyPin: (token, pin) => request('/auth/verify-pin', { token, method: 'POST', body: { pin } }),
  account: (token) => request('/account', { token }),
  transactions: (token) => request('/transactions/', { token }),
  goals: (token) => request('/goals', { token }),
  beneficiaries: (token) => request('/beneficiaries/', { token }),
  addBeneficiary: (token, body) => request('/beneficiaries/', { token, method: 'POST', body }),
  deleteBeneficiary: (token, id) => request(`/beneficiaries/${id}`, { token, method: 'DELETE' }),
  resolveBeneficiary: (token, body) => request('/beneficiaries/resolve', { token, method: 'POST', body }),
  banks: () => request('/beneficiaries/banks'),
  fetchBanks: () => request('/banks'),
  history: (token) => request('/conversation/history', { token }),
  talk: (token, text, voice) => request('/conversation/text', { token, method: 'POST', body: { text, voice } }),
  transfer: (token, body, idempotencyKey = createIdempotencyKey()) =>
    request('/transactions/transfer', {
      token: token || freshToken(),
      method: 'POST',
      body,
      requireAuth: true,
      extraHeaders: { 'Idempotency-Key': idempotencyKey },
    }),
  createGoal: (token, body) => request('/actions/goal', { token, method: 'POST', body }),
  depositGoal: (token, id, body) =>
    request(`/actions/goals/${id}/deposit`, { token, method: 'POST', body }),
  withdrawGoal: (token, id, body) =>
    request(`/actions/goals/${id}/withdraw`, { token, method: 'POST', body }),
  verifyAccount: (token, body) => request('/actions/verify-account', { token, method: 'POST', body }),
  salaryDemo: (token) => request('/demo/salary-landed', { token, method: 'POST', body: {} }),
  patchGoal: (token, id, body) =>
    request(`/actions/goals/${id}`, { token, method: 'PATCH', body }),
  updateProfile: (token, body) =>
    request('/settings/profile', { token, method: 'PATCH', body }),

  /**
   * SSE streaming conversation.
   * Sends the user's text and calls onDecision when the decision event arrives.
   * Returns a promise that resolves when the stream ends.
   */
  talkStream: async (token, text, voice, { onStatus, onDecision, onError }) => {
    const res = await fetch(`${API}/conversation/text-stream`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ text, voice }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Stream request failed');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'status' && onStatus) onStatus(data);
            else if (currentEvent === 'decision' && onDecision) onDecision(data);
            else if (currentEvent === 'error' && onError) onError(data);
          } catch (err) {
            console.error('SSE JSON parse error:', err);
          }
          currentEvent = null;
        } else if (line === '') {
          // Empty line usually means end of an event block, but we clear currentEvent after reading data anyway.
        }
      }
    }
  },
};

export function handleAuthError() {
  localStorage.removeItem('zuri_token');
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('zuri_user');
  window.location.href = '/';
}

export const LANGUAGE_NAMES = {
  en: 'English',
  pcm: 'Pidgin',
  yo: 'Yoruba',
  ig: 'Igbo',
  ha: 'Hausa',
};

export function getLanguageLabel(code) {
  return LANGUAGE_NAMES[code] || code || 'English';
}

export function formatNaira(kobo) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format((kobo || 0) / 100);
}

export function speakText(text, lang = 'en', audioUrl = null) {
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch((err) => console.error('Audio playback failed:', err));
    return;
  }

  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  if (lang === 'yo') u.lang = 'en-NG';
  else if (lang === 'pcm') u.lang = 'en-NG';
  else u.lang = 'en-NG';
  window.speechSynthesis.speak(u);
}
