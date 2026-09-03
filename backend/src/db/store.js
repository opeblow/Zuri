import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';

// Connect to SQLite DB
const dbPath = path.join(process.cwd(), 'zuri.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Better concurrency

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    full_name TEXT,
    language_pref TEXT,
    pin_hash TEXT,
    biometric_enabled INTEGER DEFAULT 0,
    daily_biometric_limit_kobo INTEGER,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    monnify_reserved_account TEXT,
    monnify_account_ref TEXT,
    bank_name TEXT,
    balance_kobo INTEGER DEFAULT 0,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    nickname TEXT,
    full_name TEXT,
    account_number TEXT,
    bank_code TEXT,
    bank_name TEXT,
    last_sent_at TEXT,
    send_count INTEGER DEFAULT 0,
    usual_amount_kobo INTEGER DEFAULT 0,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    monnify_ref TEXT UNIQUE,
    direction TEXT,
    amount_kobo INTEGER,
    counterparty_name TEXT,
    counterparty_bank TEXT,
    narration TEXT,
    category TEXT,
    status TEXT,
    occurred_at TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    current_amount_kobo INTEGER DEFAULT 0,
    target_amount_kobo INTEGER,
    target_date TEXT,
    recurring_amount_kobo INTEGER,
    monnify_mandate_ref TEXT,
    status TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    role TEXT,
    text TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    trigger_type TEXT,
    trigger_config TEXT,
    action_type TEXT,
    action_config TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Expose raw db just in case it is needed for scripts.
 */
export function getDb() {
  return db;
}

export function resetDb() {
  const tables = ['accounts', 'beneficiaries', 'transactions', 'goals', 'conversations', 'automations', 'users'];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

export function findUserByPhone(phone) {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (user) user.biometric_enabled = Boolean(user.biometric_enabled);
  return user;
}

export function findUserById(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (user) user.biometric_enabled = Boolean(user.biometric_enabled);
  return user;
}

export function getAccountForUser(userId) {
  return db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(userId);
}

export function listBeneficiaries(userId) {
  return db.prepare('SELECT * FROM beneficiaries WHERE user_id = ?').all(userId);
}

export function listTransactions(userId, { limit = 50, category, offset = 0 } = {}) {
  let query = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

export function listGoals(userId) {
  return db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId);
}

export function getGoalById(userId, goalId) {
  return db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(goalId, userId);
}

export function listConversations(userId, limit = 80) {
  return db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT ?').all(userId, limit);
}

export function listAutomations(userId) {
  const rows = db.prepare('SELECT * FROM automations WHERE user_id = ? AND active = 1').all(userId);
  return rows.map(r => ({
    ...r,
    trigger_config: r.trigger_config ? JSON.parse(r.trigger_config) : null,
    action_config: r.action_config ? JSON.parse(r.action_config) : null,
    active: Boolean(r.active)
  }));
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
    biometric_enabled: 0,
    daily_biometric_limit_kobo: 2_000_000,
    created_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO users (id, phone, email, full_name, language_pref, pin_hash, biometric_enabled, daily_biometric_limit_kobo, created_at)
    VALUES (@id, @phone, @email, @full_name, @language_pref, @pin_hash, @biometric_enabled, @daily_biometric_limit_kobo, @created_at)
  `).run(user);
  return { ...user, biometric_enabled: false };
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
  db.prepare(`
    INSERT INTO accounts (id, user_id, monnify_reserved_account, monnify_account_ref, bank_name, balance_kobo, created_at)
    VALUES (@id, @user_id, @monnify_reserved_account, @monnify_account_ref, @bank_name, @balance_kobo, @created_at)
  `).run(account);
  return account;
}

export function upsertTransaction(row) {
  const existing = db.prepare('SELECT * FROM transactions WHERE monnify_ref = ?').get(row.monnify_ref);
  if (existing) {
    const updated = { ...existing, ...row };
    db.prepare(`
      UPDATE transactions SET 
        direction = @direction, amount_kobo = @amount_kobo, counterparty_name = @counterparty_name, 
        counterparty_bank = @counterparty_bank, narration = @narration, category = @category, 
        status = @status, occurred_at = @occurred_at
      WHERE id = @id
    `).run(updated);
    return { row: updated, created: false };
  }
  
  const tx = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
  db.prepare(`
    INSERT INTO transactions (id, user_id, monnify_ref, direction, amount_kobo, counterparty_name, counterparty_bank, narration, category, status, occurred_at, created_at)
    VALUES (@id, @user_id, @monnify_ref, @direction, @amount_kobo, @counterparty_name, @counterparty_bank, @narration, @category, @status, @occurred_at, @created_at)
  `).run(tx);
  return { row: tx, created: true };
}

export function adjustBalance(userId, deltaKobo) {
  db.prepare('UPDATE accounts SET balance_kobo = MAX(0, balance_kobo + ?) WHERE user_id = ?').run(deltaKobo, userId);
  const account = getAccountForUser(userId);
  if (!account) throw new Error('Account not found');
  return account;
}

export function pushConversation(entry) {
  const row = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...entry,
  };
  db.prepare(`
    INSERT INTO conversations (id, user_id, role, text, created_at)
    VALUES (@id, @user_id, @role, @text, @created_at)
  `).run(row);
  return row;
}

export function findTransactionById(userId, txId) {
  return db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, userId);
}

export function updateUser(userId, fields) {
  const user = findUserById(userId);
  if (!user) return null;
  const allowed = ['language_pref', 'daily_biometric_limit_kobo', 'pin_hash', 'biometric_enabled'];
  const updates = [];
  const params = {};
  for (const key of Object.keys(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = @${key}`);
      params[key] = key === 'biometric_enabled' ? (fields[key] ? 1 : 0) : fields[key];
    }
  }
  if (updates.length > 0) {
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = @id`).run({ ...params, id: userId });
  }
  return findUserById(userId);
}

export function deleteGoal(userId, goalId) {
  const result = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(goalId, userId);
  return result.changes > 0;
}

export function deleteBeneficiary(userId, beneficiaryId) {
  const info = db.prepare('DELETE FROM beneficiaries WHERE id = ? AND user_id = ?').run(beneficiaryId, userId);
  return info.changes > 0;
}

export function deleteAutomation(userId, automationId) {
  const result = db.prepare('DELETE FROM automations WHERE id = ? AND user_id = ?').run(automationId, userId);
  return result.changes > 0;
}

export function deleteUserData(userId) {
  const tables = ['accounts', 'beneficiaries', 'transactions', 'goals', 'conversations', 'automations'];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return true;
}

// Additional helpers needed for initial seeding in SQLite
export function insertBeneficiary(beneficiary) {
  db.prepare(`
    INSERT INTO beneficiaries (id, user_id, nickname, full_name, account_number, bank_code, bank_name, last_sent_at, send_count, usual_amount_kobo, created_at)
    VALUES (@id, @user_id, @nickname, @full_name, @account_number, @bank_code, @bank_name, @last_sent_at, @send_count, @usual_amount_kobo, @created_at)
  `).run(beneficiary);
}

export function insertGoal(goal) {
  db.prepare(`
    INSERT INTO goals (id, user_id, name, current_amount_kobo, target_amount_kobo, target_date, recurring_amount_kobo, monnify_mandate_ref, status, created_at)
    VALUES (@id, @user_id, @name, @current_amount_kobo, @target_amount_kobo, @target_date, @recurring_amount_kobo, @monnify_mandate_ref, @status, @created_at)
  `).run(goal);
}

export function updateGoal(goal) {
  db.prepare(`
    UPDATE goals 
    SET name = @name, current_amount_kobo = @current_amount_kobo, target_amount_kobo = @target_amount_kobo, target_date = @target_date, recurring_amount_kobo = @recurring_amount_kobo, monnify_mandate_ref = @monnify_mandate_ref, status = @status
    WHERE id = @id AND user_id = @user_id
  `).run(goal);
}

export function insertAutomation(auto) {
  const row = {
    ...auto,
    trigger_config: auto.trigger_config ? JSON.stringify(auto.trigger_config) : null,
    action_config: auto.action_config ? JSON.stringify(auto.action_config) : null,
    active: auto.active ? 1 : 0
  };
  db.prepare(`
    INSERT INTO automations (id, user_id, name, trigger_type, trigger_config, action_type, action_config, active, created_at)
    VALUES (@id, @user_id, @name, @trigger_type, @trigger_config, @action_type, @action_config, @active, @created_at)
  `).run(row);
}
