import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { logger, redact } from '../lib/logger.js';

/**
 * Monnify client.
 * - DEMO_MODE: returns realistic sandbox-shaped responses (no network).
 * - Live: authenticates with Basic → Bearer, caches token ~55 min.
 */
const tokenCache = { value: null, expiresAt: 0 };

function demoMode() {
  return process.env.DEMO_MODE !== 'false';
}

function basicAuthHeader() {
  const raw = `${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function getBearerToken() {
  if (demoMode()) return 'demo-bearer-token';
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const base = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader() },
  });
  if (!res.ok) throw new Error(`Monnify auth failed: ${res.status}`);
  const data = await res.json();
  tokenCache.value = data.responseBody.accessToken;
  tokenCache.expiresAt = Date.now() + 55 * 60 * 1000;
  return tokenCache.value;
}

async function monnifyFetch(path, { method = 'GET', body } = {}) {
  if (demoMode()) throw new Error('monnifyFetch called in demo — use wrappers');
  const token = await getBearerToken();
  const base = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    tokenCache.value = null;
    return monnifyFetch(path, { method, body });
  }
  const data = await res.json();
  if (!res.ok) {
    logger.error({ path, status: res.status }, 'Monnify error');
    throw new Error(data.responseMessage || 'Monnify request failed');
  }
  return data;
}

export async function createReservedAccount({ accountReference, accountName, customerEmail, customerName }) {
  if (demoMode()) {
    const digits = createHash('sha256').update(accountReference).digest('hex').replace(/\D/g, '').slice(0, 10) || '7800000001';
    return {
      accountNumber: digits.padEnd(10, '0').slice(0, 10),
      accountReference,
      bankName: 'Moniepoint MFB',
      accountName: customerName,
    };
  }
  const data = await monnifyFetch('/api/v2/bank-transfer/reserved-accounts', {
    method: 'POST',
    body: {
      accountReference,
      accountName,
      currencyCode: 'NGN',
      contractCode: process.env.MONNIFY_CONTRACT_CODE,
      customerEmail,
      customerName,
      getAllAvailableBanks: true,
    },
  });
  const body = data.responseBody;
  return {
    accountNumber: body.accounts?.[0]?.accountNumber || body.accountNumber,
    accountReference: body.accountReference,
    bankName: body.accounts?.[0]?.bankName || 'Moniepoint MFB',
    accountName: body.accountName,
  };
}

const MOCK_NAMES = [
  'Adebayo Obi', 'Chioma Nwosu', 'Folake Adeyemi', 'Emeka Okafor',
  'Aisha Bello', 'Tunde Bakare', 'Ngozi Eze', 'Ibrahim Musa',
  'Yetunde Ajayi', 'Chukwuma Igwe', 'Halima Yusuf', 'Oluwaseun Adekunle',
  'Blessing Udoh', 'Kabiru Sani', 'Funmilayo Ogundimu', 'Obinna Nwachukwu',
];

export async function verifyBankAccount({ accountNumber, bankCode }) {
  if (demoMode()) {
    const hash = accountNumber.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const name = MOCK_NAMES[hash % MOCK_NAMES.length];
    logger.info({ accountNumber: redact(accountNumber) }, `Demo mock verification → ${name}`);
    return { accountName: name, accountNumber, bankCode };
  }

  const token = await getBearerToken();
  const base = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';

  const data = await nameInquiry({ base, token, accountNumber, bankCode });

  const body = data.responseBody;
  logger.info({ accountNumber: redact(accountNumber) }, `Resolved → ${body.accountName}`);
  return {
    accountName: body.accountName,
    accountNumber: body.accountNumber || accountNumber,
    bankCode,
  };
}

/** Monnify-generated accounts (e.g. Moniepoint MFB reserved accounts). */
async function nameInquiry({ base, token, accountNumber, bankCode }) {
  const sessionId = createHash('sha256')
    .update(`${accountNumber}:${bankCode}:${Date.now()}`)
    .digest('hex')
    .slice(0, 40);

  const sandboxBankCode = '71272'; // Force sandbox bank code
  const res = await fetch(`${base}/api/v1/account-provider/name-inquiry/${sandboxBankCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountNumber, sessionId }),
  });

  if (res.status === 401) {
    tokenCache.value = null;
    return nameInquiry({ base, token: await getBearerToken(), accountNumber, bankCode });
  }

  const data = await res.json();
  if (!res.ok || !data.requestSuccessful) {
    logger.error({ accountNumber: redact(accountNumber), status: res.status }, 'Monnify name inquiry failed');
    throw new Error(data.responseMessage || 'Account verification failed');
  }
  return data;
}


export async function singleTransfer({ amount, reference, narration, destinationBankCode, destinationAccountNumber, destinationAccountName, sourceAccountNumber, currency = 'NGN' }) {
  logger.info(
    {
      reference,
      amount,
      account: redact(destinationAccountNumber),
    },
    'Initiating real transfer via Monnify sandbox',
  );

  let token = await getBearerToken();
  const base = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
  const sourceAccount = sourceAccountNumber || process.env.MONNIFY_WALLET_ACCOUNT || '1992176477';

  const payload = {
    amount: amount / 100, // API expects amount in standard unit (Naira)
    reference,
    narration,
    destinationBankCode,
    destinationAccountNumber,
    currency,
    sourceAccountNumber: sourceAccount,
    destinationAccountName,
  };

  let res = await fetch(`${base}/api/v2/disbursements/single`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (res.status === 401) {
    tokenCache.value = null;
    token = await getBearerToken();
    res = await fetch(`${base}/api/v2/disbursements/single`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  const data = await res.json();
  
  if (!res.ok || !data.requestSuccessful) {
    logger.error({ reference, status: res.status, body: data }, 'Monnify disbursement failed');
    throw new Error(data.responseMessage || 'Transfer failed at provider');
  }

  return {
    transactionReference: data.responseBody.transactionReference || `MFY-${reference}`,
    paymentReference: reference,
    status: data.responseBody.status || 'SUCCESS',
    amount,
  };
}

export async function createDirectDebitMandate({ customerName, customerEmail, amount, mandateReference }) {
  // Always return mock for mandates because real Monnify DD requires
  // customer bank details and a redirect authorization flow which Zuri frontend does not support.
  logger.info({ mandateReference }, 'Mocking direct debit mandate creation');
  return {
    mandateReference,
    mandateStatus: 'ACTIVE',
    amount,
    customerName,
    customerEmail,
  };
}

/** Always first line of webhook handler */
export function verifyMonnifySignature(rawBody, receivedHash) {
  if (demoMode() && (!receivedHash || receivedHash === 'demo')) return true;
  if (!receivedHash || !process.env.MONNIFY_SECRET_KEY) return false;
  const expected = createHmac('sha512', process.env.MONNIFY_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHash));
  } catch {
    return false;
  }
}

export const NIGERIAN_BANKS = [
  { code: '058', name: 'GTBank' },
  { code: '033', name: 'UBA' },
  { code: '011', name: 'First Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '032', name: 'Union Bank' },
  { code: '044', name: 'Access Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '215', name: 'Unity Bank' },
  { code: '050', name: 'Ecobank' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '035', name: 'Wema Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '999', name: 'Moniepoint MFB' },
];
