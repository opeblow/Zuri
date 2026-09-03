import numberToWords from 'number-to-words';
import {
  getAccountForUser,
  listBeneficiaries,
  listGoals,
  listTransactions,
  listAutomations,
} from '../db/store.js';

/**
 * Builds the LLM-ready financial memory snapshot.
 * This is what makes Zuri feel like it knows the user.
 */
export function buildMemorySnapshot(user) {
  const account = getAccountForUser(user.id);
  const beneficiaries = listBeneficiaries(user.id);
  const goals = listGoals(user.id).filter((g) => g.status === 'active');
  const automations = listAutomations(user.id);
  const recent = listTransactions(user.id, { limit: 10 });
  const last30 = listTransactions(user.id, { limit: 200 }).filter((t) => {
    const age = Date.now() - new Date(t.occurred_at).getTime();
    return age <= 30 * 86400000 && t.direction === 'outbound';
  });

  const categorySum = (cat) =>
    last30.filter((t) => t.category === cat).reduce((s, t) => s + t.amount_kobo, 0);

  const salaries = listTransactions(user.id, { limit: 200 })
    .filter((t) => t.category === 'salary' && t.direction === 'inbound')
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

  const lastSalary = salaries[0];
  const salaryDay = lastSalary ? new Date(lastSalary.occurred_at).getDate() : 28;

  return {
    user: {
      name: user.full_name.split(' ')[0],
      language: user.language_pref,
      current_balance_kobo: account?.balance_kobo ?? 0,
      current_balance_display: formatNaira(account?.balance_kobo ?? 0),
      reserved_account: account?.monnify_reserved_account,
      bank_name: account?.bank_name,
    },
    salary_pattern: {
      typical_amount_kobo: lastSalary?.amount_kobo ?? 45_000_000,
      typical_amount_display: formatNaira(lastSalary?.amount_kobo ?? 45_000_000),
      typical_day_of_month: salaryDay,
      last_received_at: lastSalary?.occurred_at ?? null,
      employer_hint: lastSalary?.counterparty_name ?? 'Design Corp Ltd',
    },
    beneficiaries: beneficiaries.map((b) => {
      const usualKobo = Math.round(
        (listTransactions(user.id, { limit: 100 })
          .filter((t) => t.counterparty_name === b.full_name && t.direction === 'outbound')
          .reduce((s, t, _, arr) => s + t.amount_kobo / Math.max(arr.length, 1), 0) || 5_000_000)
      );
      return {
        id: b.id,
        nickname: b.nickname,
        full_name: b.full_name,
        bank_name: b.bank_name,
        last_sent: b.last_sent_at,
        send_count: b.send_count,
        usual_amount_kobo: usualKobo,
        usual_amount_display: formatNaira(usualKobo),
      };
    }),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      target_kobo: g.target_amount_kobo,
      target_display: formatNaira(g.target_amount_kobo),
      current_kobo: g.current_amount_kobo,
      current_display: formatNaira(g.current_amount_kobo),
      monthly_kobo: g.recurring_amount_kobo,
      monthly_display: formatNaira(g.recurring_amount_kobo),
      progress_pct: Math.round((g.current_amount_kobo / g.target_amount_kobo) * 100),
      recurring_amount_kobo: g.recurring_amount_kobo,
    })),
    automations: automations.map((a) => ({
      id: a.id,
      name: a.name,
      trigger_type: a.trigger_type,
      action_type: a.action_type,
      action_config: a.action_config,
      active: a.active,
    })),
    recent_categories: {
      food_last_30d_kobo: categorySum('food'),
      food_last_30d_display: formatNaira(categorySum('food')),
      transport_last_30d_kobo: categorySum('transport'),
      transport_last_30d_display: formatNaira(categorySum('transport')),
      family_last_30d_kobo: categorySum('family'),
      family_last_30d_display: formatNaira(categorySum('family')),
      savings_last_30d_kobo: categorySum('savings'),
    },
    recent_transactions: recent.map((t) => ({
      direction: t.direction,
      amount_kobo: t.amount_kobo,
      counterparty: t.counterparty_name,
      category: t.category,
      narration: t.narration,
      occurred_at: t.occurred_at,
      status: t.status,
    })),
  };
}

export function formatNaira(kobo) {
  const naira = (kobo || 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(naira);
}

export function formatSpokenNaira(kobo) {
  const naira = (kobo || 0) / 100;
  return `${numberToWords.toWords(naira)} Naira`;
}
