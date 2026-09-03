import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * In-memory store for hackathon DEMO_MODE.
 * Mirrors the Postgres schema from the brief so we can swap to real PG later
 * without rewriting route handlers.
 */
const db = {
  users: [],
  accounts: [],
  beneficiaries: [],
  transactions: [],
  goals: [],
  conversations: [],
  automations: [],
};

export function getDb() {
  return db;
}

export function resetDb() {
  Object.keys(db).forEach((k) => {
    db[k] = [];
  });
}

export function findUserByPhone(phone) {
  return db.users.find((u) => u.phone === phone);
}

export function findUserById(id) {
  return db.users.find((u) => u.id === id);
}

export function getAccountForUser(userId) {
  return db.accounts.find((a) => a.user_id === userId);
}

export function listBeneficiaries(userId) {
  return db.beneficiaries.filter((b) => b.user_id === userId);
}

export function listTransactions(userId, { limit = 50, category, offset = 0 } = {}) {
  let rows = db.transactions
    .filter((t) => t.user_id === userId)
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  if (category) rows = rows.filter((t) => t.category === category);
  return rows.slice(offset, offset + limit);
}

export function listGoals(userId) {
  return db.goals.filter((g) => g.user_id === userId);
}

export function listConversations(userId, limit = 80) {
  return db.conversations
    .filter((c) => c.user_id === userId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-limit);
}

export function listAutomations(userId) {
  return db.automations.filter((a) => a.user_id === userId && a.active);
}

export function createUser({ phone, email, full_name, language_pref, pin }) {
  const cost = Number(process.env.BCRYPT_COST || 12);
  const user = {
    id: randomUUID(),
    phone,
    email,
    full_name,
    language_pref: language_pref || 'en',
    pin_hash: bcrypt.hashSync(String(pin), cost),
    biometric_enabled: false,
    daily_biometric_limit_kobo: 2_000_000,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  return user;
}

export function createAccount(userId, { monnify_reserved_account, monnify_account_ref, bank_name, balance_kobo = 0 }) {
  const account = {
    id: randomUUID(),
    user_id: userId,
    monnify_reserved_account,
    monnify_account_ref,
    bank_name,
    balance_kobo,
    created_at: new Date().toISOString(),
  };
  db.accounts.push(account);
  return account;
}

export function upsertTransaction(row) {
  const existing = db.transactions.find((t) => t.monnify_ref === row.monnify_ref);
  if (existing) {
    Object.assign(existing, row);
    return { row: existing, created: false };
  }
  const tx = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
  db.transactions.push(tx);
  return { row: tx, created: true };
}

export function adjustBalance(userId, deltaKobo) {
  const account = getAccountForUser(userId);
  if (!account) throw new Error('Account not found');
  account.balance_kobo = Math.max(0, account.balance_kobo + deltaKobo);
  return account;
}

export function pushConversation(entry) {
  const row = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...entry,
  };
  db.conversations.push(row);
  return row;
}

export function findTransactionById(userId, txId) {
  return db.transactions.find((t) => t.id === txId && t.user_id === userId);
}

export function updateUser(userId, fields) {
  const user = findUserById(userId);
  if (!user) return null;
  const allowed = ['language_pref', 'daily_biometric_limit_kobo', 'pin_hash', 'biometric_enabled'];
  for (const key of Object.keys(fields)) {
    if (allowed.includes(key)) user[key] = fields[key];
  }
  return user;
}

export function deleteGoal(userId, goalId) {
  const idx = db.goals.findIndex((g) => g.id === goalId && g.user_id === userId);
  if (idx === -1) return false;
  db.goals.splice(idx, 1);
  return true;
}

export function deleteAutomation(userId, automationId) {
  const idx = db.automations.findIndex((a) => a.id === automationId && a.user_id === userId);
  if (idx === -1) return false;
  db.automations.splice(idx, 1);
  return true;
}

/** Cascade-delete all user data (for account deletion). */
export function deleteUserData(userId) {
  const tables = ['accounts', 'beneficiaries', 'transactions', 'goals', 'conversations', 'automations'];
  for (const table of tables) {
    db[table] = db[table].filter((row) => row.user_id !== userId);
  }
  db.users = db.users.filter((u) => u.id !== userId);
  return true;
}
