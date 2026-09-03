import { Router } from 'express';
import {
  getAccountForUser,
  listGoals,
  listTransactions,
} from '../db/store.js';
import { authRequired } from '../middleware/auth.js';
import { buildMemorySnapshot, formatNaira } from '../services/memory.js';

const router = Router();

router.get('/account', authRequired, (req, res) => {
  const account = getAccountForUser(req.user.id);
  if (!account) return res.status(404).json({ error: 'No account' });

  const txs = listTransactions(req.user.id, { limit: 200 });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = txs.filter((t) => new Date(t.occurred_at) >= monthStart);
  const inflow = thisMonth.filter((t) => t.direction === 'inbound').reduce((s, t) => s + t.amount_kobo, 0);
  const outflow = thisMonth.filter((t) => t.direction === 'outbound').reduce((s, t) => s + t.amount_kobo, 0);

  res.json({
    reserved_account: account.monnify_reserved_account,
    bank_name: account.bank_name,
    balance_kobo: account.balance_kobo,
    balance_display: formatNaira(account.balance_kobo),
    monthly_summary: {
      inflow_kobo: inflow,
      outflow_kobo: outflow,
      inflow_display: formatNaira(inflow),
      outflow_display: formatNaira(outflow),
    },
  });
});

router.get('/transactions', authRequired, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const category = req.query.category || undefined;
  const rows = listTransactions(req.user.id, { limit, offset, category });
  res.json({
    transactions: rows.map((t) => ({
      ...t,
      amount_display: formatNaira(t.amount_kobo),
    })),
  });
});

router.get('/goals', authRequired, (req, res) => {
  res.json({
    goals: listGoals(req.user.id).map((g) => ({
      ...g,
      target_display: formatNaira(g.target_amount_kobo),
      current_display: formatNaira(g.current_amount_kobo),
      recurring_display: formatNaira(g.recurring_amount_kobo),
      progress_pct: Math.min(100, Math.round((g.current_amount_kobo / g.target_amount_kobo) * 100)),
    })),
  });
});

/** Internal-style memory snapshot (also used by conversation). Exposed for demo inspector. */
router.get('/memory/snapshot', authRequired, (req, res) => {
  res.json(buildMemorySnapshot(req.user));
});

export default router;
