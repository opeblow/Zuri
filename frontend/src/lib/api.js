const API = '/api';

function authHeaders(token, extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function request(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error || data.message || 'Request failed';
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
  transactions: (token) => request('/transactions', { token }),
  goals: (token) => request('/goals', { token }),
  beneficiaries: (token) => request('/beneficiaries', { token }),
  addBeneficiary: (token, body) => request('/beneficiaries', { token, method: 'POST', body }),
  banks: () => request('/beneficiaries/banks'),
  history: (token) => request('/conversation/history', { token }),
  talk: (token, text, voice) => request('/conversation/text', { token, method: 'POST', body: { text, voice } }),
  transfer: (token, body) => request('/actions/transfer', { token, method: 'POST', body }),
  createGoal: (token, body) => request('/actions/goal', { token, method: 'POST', body }),
  verifyAccount: (token, body) => request('/actions/verify-account', { token, method: 'POST', body }),
  salaryDemo: (token) => request('/demo/salary-landed', { token, method: 'POST', body: {} }),
  resetDemo: () => request('/demo/reset', { method: 'POST', body: {} }),
  patchGoal: (token, id, body) =>
    request(`/actions/goals/${id}`, { token, method: 'PATCH', body }),
};

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
