export const API = import.meta.env.VITE_API_URL || '/api';

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
  talk: (token, text, voice) => request('/conversation/text', { token, method: 'POST', body: { text, voice } }),
  conversationHistory: (token) => request('/conversation/history', { token }),
  insights: (token) => request('/insights/', { token }),
  talkAudio: async (token, blob) => {
    const effectiveToken = token || freshToken();
    const form = new FormData();
    form.append('file', blob, 'voice.webm');
    const res = await fetch(`${API}/conversation/audio`, {
      method: 'POST',
      headers: effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {},
      body: form,
      cache: 'no-store',
    });
    if (res.status === 401) throw new AuthError();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Voice request failed');
    return data;
  },
  logTransaction: (token, body) => request('/transactions/log', { token, method: 'POST', body }),
  recategorizeTransaction: (token, id, category) =>
    request(`/transactions/${id}`, { token, method: 'PATCH', body: { category } }),
  onboardingSetup: (token, body) => request('/onboarding/setup', { token, method: 'POST', body }),
  createGoal: (token, body) => request('/actions/goal', { token, method: 'POST', body }),
  depositGoal: (token, id, body) =>
    request(`/actions/goals/${id}/deposit`, { token, method: 'POST', body }),
  withdrawGoal: (token, id, body) =>
    request(`/actions/goals/${id}/withdraw`, { token, method: 'POST', body }),
  patchGoal: (token, id, body) =>
    request(`/actions/goals/${id}`, { token, method: 'PATCH', body }),
  updateProfile: (token, body) =>
    request('/settings/profile', { token, method: 'PATCH', body }),
  resetDemo: (token) => request('/demo/reset', { token, method: 'POST', body: {} }),
  beneficiaries: (token) => request('/beneficiaries/', { token }),
  addBeneficiary: (token, body) => request('/beneficiaries/', { token, method: 'POST', body }),
  deleteBeneficiary: (token, id) => request(`/beneficiaries/${id}`, { token, method: 'DELETE' }),
  banks: (token) => request('/beneficiaries/banks', { token }),
  resolveAccount: (token, body) => request('/beneficiaries/resolve', { token, method: 'POST', body }),
  transfer: (token, body) => request('/actions/transfer', { token, method: 'POST', body }),
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
