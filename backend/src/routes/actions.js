import { Router } from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  adjustBalance,
  deleteAutomation,
  deleteGoal,
  getAccountForUser,
  getDb,
  listAutomations,
  listBeneficiaries,
  upsertTransaction,
} from '../db/store.js';
import { authRequired, verifyPin } from '../middleware/auth.js';
import { createDirectDebitMandate, singleTransfer } from '../services/monnify.js';
import { formatNaira } from '../services/memory.js';
import { logger } from '../lib/logger.js';

const router = Router();
const actionLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
});

router.use(authRequired, actionLimiter);

function requirePin(req, res) {
  if (!verifyPin(req.user, req.body?.pin)) {
    res.status(401).json({ error: 'PIN required', verified: false });
    return false;
  }
  return true;
}

router.post('/transfer', async (req, res) => {
  try {
    if (!requirePin(req, res)) return;

    const schema = z.object({
      beneficiary_id: z.string().uuid(),
      amount_kobo: z.number().int().positive(),
      narration: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const bene = listBeneficiaries(req.user.id).find((b) => b.id === body.beneficiary_id);
    if (!bene) return res.status(404).json({ error: 'Beneficiary not found' });

    // Non-negotiable: voice path only hits saved beneficiaries (already true here)
    if (bene.send_count === 0 && body.amount_kobo > 2_000_000) {
      return res.status(400).json({ error: 'First-send cap is ₦20,000' });
    }

    const account = getAccountForUser(req.user.id);
    if (!account || account.balance_kobo < body.amount_kobo) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Idempotency: store reference BEFORE calling Monnify
    const paymentReference = `ZURI-TX-${randomUUID()}`;
    upsertTransaction({
      user_id: req.user.id,
      monnify_ref: paymentReference,
      direction: 'outbound',
      amount_kobo: body.amount_kobo,
      counterparty_name: bene.full_name,
      counterparty_bank: bene.bank_name,
      narration: body.narration || `Zuri to ${bene.nickname}`,
      category: 'family',
      status: 'pending',
      occurred_at: new Date().toISOString(),
    });

    const result = await singleTransfer({
      amount: body.amount_kobo,
      reference: paymentReference,
      narration: body.narration || `Zuri to ${bene.nickname}`,
      destinationBankCode: bene.bank_code,
      destinationAccountNumber: bene.account_number,
    });

    adjustBalance(req.user.id, -body.amount_kobo);
    const { row } = upsertTransaction({
      user_id: req.user.id,
      monnify_ref: paymentReference,
      direction: 'outbound',
      amount_kobo: body.amount_kobo,
      counterparty_name: bene.full_name,
      counterparty_bank: bene.bank_name,
      narration: body.narration || `Zuri to ${bene.nickname}`,
      category: 'family',
      status: 'settled',
      occurred_at: new Date().toISOString(),
    });

    bene.send_count += 1;
    bene.last_sent_at = new Date().toISOString();

    logger.info({ ref: paymentReference }, 'Transfer settled');
    res.json({
      ok: true,
      transaction: row,
      monnify: result,
      spoken: `Money has landed with ${bene.nickname}. ${formatNaira(body.amount_kobo)} sent to ${bene.full_name}.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

const bulkTransferItemSchema = z.object({
  beneficiary_id: z.string().uuid(),
  amount_kobo: z.number().int().positive(),
  narration: z.string().optional(),
});

router.post('/bulk-transfer', async (req, res) => {
  try {
    if (!requirePin(req, res)) return;
    const items = z.array(bulkTransferItemSchema).min(1).parse(req.body?.transfers);

    const account = getAccountForUser(req.user.id);
    const totalKobo = items.reduce((sum, i) => sum + i.amount_kobo, 0);
    if (!account || account.balance_kobo < totalKobo) {
      return res.status(400).json({
        error: 'Insufficient balance for bulk transfer',
        required_kobo: totalKobo,
        available_kobo: account?.balance_kobo ?? 0,
      });
    }

    const results = [];
    for (const item of items) {
      const bene = listBeneficiaries(req.user.id).find((b) => b.id === item.beneficiary_id);
      if (!bene) {
        results.push({ error: 'beneficiary not found', beneficiary_id: item.beneficiary_id });
        continue;
      }
      const paymentReference = `ZURI-BULK-${randomUUID()}`;
      adjustBalance(req.user.id, -item.amount_kobo);
      upsertTransaction({
        user_id: req.user.id,
        monnify_ref: paymentReference,
        direction: 'outbound',
        amount_kobo: item.amount_kobo,
        counterparty_name: bene.full_name,
        counterparty_bank: bene.bank_name,
        narration: item.narration || 'Zuri bulk',
        category: 'family',
        status: 'settled',
        occurred_at: new Date().toISOString(),
      });
      bene.send_count += 1;
      bene.last_sent_at = new Date().toISOString();
      results.push({ ok: true, paymentReference, beneficiary: bene.nickname, amount_kobo: item.amount_kobo });
    }
    res.json({ results, total_sent_kobo: totalKobo });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.post('/goal', async (req, res) => {
  try {
    if (!requirePin(req, res)) return;
    const schema = z.object({
      name: z.string().min(2),
      target_amount_kobo: z.number().int().positive(),
      target_date: z.string(),
      recurring_amount_kobo: z.number().int().positive(),
      goal_id: z.string().uuid().nullable().optional(),
    });
    const body = schema.parse(req.body);
    const db = getDb();
    let goal = body.goal_id ? db.goals.find((g) => g.id === body.goal_id && g.user_id === req.user.id) : null;

    const mandateReference = `ZURI-MD-${randomUUID()}`;
    const mandate = await createDirectDebitMandate({
      customerName: req.user.full_name,
      customerEmail: req.user.email,
      amount: body.recurring_amount_kobo,
      mandateReference,
    });

    if (goal) {
      goal.target_amount_kobo = body.target_amount_kobo;
      goal.target_date = body.target_date;
      goal.recurring_amount_kobo = body.recurring_amount_kobo;
      goal.monnify_mandate_ref = mandate.mandateReference;
      goal.status = 'active';
    } else {
      goal = {
        id: randomUUID(),
        user_id: req.user.id,
        name: body.name,
        target_amount_kobo: body.target_amount_kobo,
        target_date: body.target_date,
        current_amount_kobo: 0,
        recurring_amount_kobo: body.recurring_amount_kobo,
        monnify_mandate_ref: mandate.mandateReference,
        status: 'active',
        created_at: new Date().toISOString(),
      };
      db.goals.push(goal);
    }

    res.json({
      goal,
      mandate,
      spoken: `Done. I'll pull ${formatNaira(body.recurring_amount_kobo)} every month into ${goal.name} via direct debit.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.post('/automation', async (req, res) => {
  if (!requirePin(req, res)) return;
  const row = {
    id: randomUUID(),
    user_id: req.user.id,
    trigger_type: req.body.trigger_type || 'inbound_credit',
    trigger_config: req.body.trigger_config || {},
    action_type: req.body.action_type || 'skim_to_goal',
    action_config: req.body.action_config || {},
    active: true,
    created_at: new Date().toISOString(),
  };
  getDb().automations.push(row);
  res.status(201).json({ automation: row });
});

router.patch('/goals/:id', (req, res) => {
  const goal = getDb().goals.find((g) => g.id === req.params.id && g.user_id === req.user.id);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  if (req.body.status) goal.status = req.body.status;
  if (req.body.name) goal.name = req.body.name;
  res.json({ goal });
});

router.delete('/goals/:id', (req, res) => {
  if (!deleteGoal(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.json({ ok: true });
});

/** GET /actions/automations — list user's active automation rules */
router.get('/automations', (req, res) => {
  res.json({ automations: listAutomations(req.user.id) });
});

/** DELETE /actions/automations/:id — remove an automation rule */
router.delete('/automations/:id', (req, res) => {
  if (!deleteAutomation(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  res.json({ ok: true });
});

export default router;
