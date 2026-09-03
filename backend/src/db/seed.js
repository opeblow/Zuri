import { randomUUID } from 'crypto';
import {
  createAccount,
  createUser,
  findUserByPhone,
  pushConversation,
  upsertTransaction,
  insertBeneficiary,
  insertGoal,
  insertAutomation,
} from './store.js';
import { createReservedAccount } from '../services/monnify.js';
import { logger } from '../lib/logger.js';

/**
 * Seeds a realistic 3-month history for demo Moments 1–3.
 * Demo login: phone 08012345678 / PIN 1234
 */
export async function seedDemoAccount() {
  const existing = findUserByPhone('08012345678');
  if (existing) {
    logger.info({ phone: existing.phone }, 'Demo account already exists in SQLite (PIN 1234)');
    return { user: existing };
  }

  const user = createUser({
    phone: '08012345678',
    email: 'amina@zuri.demo',
    full_name: 'Amina Okonkwo',
    language_pref: 'en',
    pin: '1234',
  });
  
  // Actually provision from Monnify if DEMO_MODE=false
  const accountRef = `ZURI-${user.id.replace(/-/g, '').slice(0, 12)}`;
  const reserved = await createReservedAccount({
    accountReference: accountRef,
    accountName: `Zuri/Amina Okonkwo`,
    customerEmail: user.email,
    customerName: user.full_name,
  });

  createAccount(user.id, {
    monnify_reserved_account: reserved.accountNumber,
    monnify_account_ref: reserved.accountReference,
    bank_name: reserved.bankName,
    balance_kobo: 29_500_000, // ₦295,000
  });

  const mummy = {
    id: randomUUID(),
    user_id: user.id,
    nickname: 'Mummy',
    full_name: 'Mrs. Adeola Adebayo',
    account_number: '0123456789',
    bank_code: '058',
    bank_name: 'GTBank',
    last_sent_at: '2026-07-05T10:00:00.000Z',
    send_count: 8,
    usual_amount_kobo: 5_000_000,
    created_at: '2026-04-01T10:00:00.000Z',
  };
  const ada = {
    id: randomUUID(),
    user_id: user.id,
    nickname: 'Ada',
    full_name: 'Ada Okafor',
    account_number: '2213344556',
    bank_code: '033',
    bank_name: 'UBA',
    last_sent_at: '2026-06-30T14:00:00.000Z',
    send_count: 3,
    usual_amount_kobo: 1_500_000,
    created_at: '2026-05-10T10:00:00.000Z',
  };
  insertBeneficiary(mummy);
  insertBeneficiary(ada);

  const rentGoal = {
    id: randomUUID(),
    user_id: user.id,
    name: 'Rent 2027',
    target_amount_kobo: 90_000_000,
    target_date: '2026-11-01',
    current_amount_kobo: 12_000_000,
    recurring_amount_kobo: 9_000_000,
    status: 'active',
    monnify_mandate_ref: null,
    created_at: '2026-05-01T10:00:00.000Z',
  };
  const taxPot = {
    id: randomUUID(),
    user_id: user.id,
    name: 'Tax pot',
    target_amount_kobo: 50_000_000,
    target_date: '2027-03-31',
    current_amount_kobo: 8_500_000,
    recurring_amount_kobo: 4_000_000,
    status: 'active',
    monnify_mandate_ref: null,
    created_at: '2026-04-15T10:00:00.000Z',
  };
  insertGoal(rentGoal);
  insertGoal(taxPot);

  insertAutomation({
    id: randomUUID(),
    user_id: user.id,
    name: 'Rent Skim',
    trigger_type: 'inbound_credit',
    trigger_config: { source_contains: 'Design Corp' },
    action_type: 'skim_to_goal',
    action_config: { goal_id: rentGoal.id, percentage: 20 },
    active: true,
    created_at: '2026-05-01T10:00:00.000Z',
  });

  const history = [
    { direction: 'inbound', amount_kobo: 45_000_000, counterparty_name: 'Design Corp Ltd', category: 'salary', daysAgo: 22, narration: 'June salary' },
    { direction: 'inbound', amount_kobo: 45_000_000, counterparty_name: 'Design Corp Ltd', category: 'salary', daysAgo: 52, narration: 'May salary' },
    { direction: 'inbound', amount_kobo: 45_000_000, counterparty_name: 'Design Corp Ltd', category: 'salary', daysAgo: 82, narration: 'April salary' },
    { direction: 'outbound', amount_kobo: 5_000_000, counterparty_name: 'Mrs. Adeola Adebayo', category: 'family', daysAgo: 15, narration: 'Mummy monthly' },
    { direction: 'outbound', amount_kobo: 5_000_000, counterparty_name: 'Mrs. Adeola Adebayo', category: 'family', daysAgo: 45, narration: 'Mummy monthly' },
    { direction: 'outbound', amount_kobo: 5_000_000, counterparty_name: 'Mrs. Adeola Adebayo', category: 'family', daysAgo: 75, narration: 'Mummy monthly' },
    { direction: 'outbound', amount_kobo: 9_000_000, counterparty_name: 'Rent goal skim', category: 'savings', daysAgo: 21, narration: 'Rent contribution' },
    { direction: 'outbound', amount_kobo: 9_000_000, counterparty_name: 'Rent goal skim', category: 'savings', daysAgo: 51, narration: 'Rent contribution' },
    { direction: 'outbound', amount_kobo: 2_400_000, counterparty_name: 'Bolt', category: 'transport', daysAgo: 3, narration: 'Bolt rides' },
    { direction: 'outbound', amount_kobo: 1_800_000, counterparty_name: 'Bolt', category: 'transport', daysAgo: 8, narration: 'Bolt rides' },
    { direction: 'outbound', amount_kobo: 2_000_000, counterparty_name: 'Bolt', category: 'transport', daysAgo: 18, narration: 'Bolt rides' },
    { direction: 'outbound', amount_kobo: 3_500_000, counterparty_name: 'Chicken Republic', category: 'food', daysAgo: 2, narration: 'Lunch' },
    { direction: 'outbound', amount_kobo: 2_800_000, counterparty_name: 'Shoprite', category: 'food', daysAgo: 6, narration: 'Groceries' },
    { direction: 'outbound', amount_kobo: 2_200_000, counterparty_name: 'Jumia Food', category: 'food', daysAgo: 12, narration: 'Delivery' },
    { direction: 'outbound', amount_kobo: 1_500_000, counterparty_name: 'Ada Okafor', category: 'family', daysAgo: 20, narration: 'Ada birthday' },
  ];

  const now = Date.now();
  for (const [i, h] of history.entries()) {
    upsertTransaction({
      user_id: user.id,
      monnify_ref: `SEED-${i}-${Date.now()}`,
      direction: h.direction,
      amount_kobo: h.amount_kobo,
      counterparty_name: h.counterparty_name,
      counterparty_bank: h.direction === 'inbound' ? 'Access Bank' : 'Various',
      narration: h.narration,
      category: h.category,
      status: 'settled',
      occurred_at: new Date(now - h.daysAgo * 86400000).toISOString(),
    });
  }

  pushConversation({
    user_id: user.id,
    role: 'zuri',
    text: "Hey Amina — I'm Zuri. Talk to me about your money. Ask in English, Pidgin, or Yoruba.",
    language: 'en',
    intent: 'greeting',
  });

  logger.info({ phone: user.phone }, 'Demo account seeded in SQLite (PIN 1234)');
  return { user, rentGoal, mummy };
}

// Allow `npm run seed`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seedDemoAccount();
}
