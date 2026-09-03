import { Router } from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  adjustBalance,
  deleteAutomation,
  deleteGoal,
  getAccountForUser,
  getAccountByReservedNumber,
  getDb,
  getGoalById,
  insertGoal,
  updateGoal,
  insertAutomation,
  listAutomations,
  listBeneficiaries,
  upsertTransaction,
  pushConversation,
} from '../db/store.js';
import { authRequired, verifyPin } from '../middleware/auth.js';
import { createDirectDebitMandate, singleTransfer, verifyBankAccount } from '../services/monnify.js';
import { formatNaira, formatSpokenNaira } from '../services/memory.js';
import { textToSpeech } from '../services/ai.js';
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
      beneficiary_id: z.string().uuid().optional(),
      account_number: z.string().optional(),
      bank_code: z.string().optional(),
      bank_name: z.string().optional(),
      amount_kobo: z.number().int().positive(),
      narration: z.string().optional(),
    });
    const body = schema.parse(req.body);

    let destName = '';
    let destBank = '';
    let destBankCode = '';
    let destAccount = '';
    let isFirstSend = false;
    let bene = null;

    if (body.beneficiary_id) {
      bene = listBeneficiaries(req.user.id).find((b) => b.id === body.beneficiary_id);
      if (!bene) return res.status(404).json({ error: 'Beneficiary not found' });
      destName = bene.full_name;
      destBank = bene.bank_name;
      destBankCode = bene.bank_code;
      destAccount = bene.account_number;
      isFirstSend = bene.send_count === 0;
    } else if (body.account_number && body.bank_code) {
      destName = `Account ${body.account_number}`;
      destBank = body.bank_name || 'Unknown Bank';
      destBankCode = body.bank_code;
      destAccount = body.account_number;
      isFirstSend = true;
    } else {
      return res.status(400).json({ error: 'Must provide beneficiary or account/bank' });
    }

    if (isFirstSend && body.amount_kobo > 2_000_000) {
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
      counterparty_name: destName,
      counterparty_bank: destBank,
      narration: body.narration || `Zuri Transfer`,
      category: 'family',
      status: 'pending',
      occurred_at: new Date().toISOString(),
    });

    const result = await singleTransfer({
      amount: body.amount_kobo,
      reference: paymentReference,
      narration: body.narration || `Zuri Transfer`,
      destinationBankCode: destBankCode,
      destinationAccountNumber: destAccount,
      destinationAccountName: destName,
    });

    adjustBalance(req.user.id, -body.amount_kobo);
    const { row } = upsertTransaction({
      user_id: req.user.id,
      monnify_ref: paymentReference,
      direction: 'outbound',
      amount_kobo: body.amount_kobo,
      counterparty_name: destName,
      counterparty_bank: destBank,
      narration: body.narration || `Zuri Transfer`,
      category: 'family',
      status: 'settled',
      occurred_at: new Date().toISOString(),
    });

    const receiverAccount = getAccountByReservedNumber(destAccount);
    if (receiverAccount) {
      adjustBalance(receiverAccount.user_id, body.amount_kobo);
      upsertTransaction({
        user_id: receiverAccount.user_id,
        monnify_ref: `${paymentReference}-inbound`,
        direction: 'inbound',
        amount_kobo: body.amount_kobo,
        counterparty_name: req.user.full_name,
        counterparty_bank: 'Zuri',
        narration: body.narration || `Zuri Transfer`,
        category: 'transfer',
        status: 'settled',
        occurred_at: new Date().toISOString(),
      });
      logger.info({ receiver_id: receiverAccount.user_id, amount: body.amount_kobo }, 'Credited internal receiver for demo');
    }

    if (bene) {
      getDb().prepare('UPDATE beneficiaries SET send_count = send_count + 1, last_sent_at = ? WHERE id = ?')
        .run(new Date().toISOString(), bene.id);
    }

    const recipientLabel = bene ? bene.full_name : destName;
    const recipientNick = bene ? bene.nickname : destName;
    logger.info({ ref: paymentReference }, 'Transfer settled');

    const text = `Money has landed with ${recipientNick}. ${formatNaira(body.amount_kobo)} sent to ${recipientLabel}.`;
    const spokenText = `Money has landed with ${recipientNick}. ${formatSpokenNaira(body.amount_kobo)} sent to ${recipientLabel}.`;
    
    const tts = await textToSpeech(spokenText, req.user.language_pref);
    
    const msg = pushConversation({
      user_id: req.user.id,
      role: 'zuri',
      text,
      language: req.user.language_pref,
      intent: 'transfer_success',
      audio_url: tts.audioUrl,
    });

    res.json({
      ok: true,
      transaction: row,
      monnify: result,
      account_name: destName,
      message: msg,
      spoken: text,
      audioUrl: tts.audioUrl,
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

router.post('/verify-account', async (req, res) => {
  try {
    const schema = z.object({
      account_number: z.string().length(10),
      bank_code: z.string().min(3),
    });
    const body = schema.parse(req.body);
    const verified = await verifyBankAccount({
      accountNumber: body.account_number,
      bankCode: body.bank_code,
    });
    res.json({
      account_name: verified.accountName,
      account_number: verified.accountNumber,
      bank_code: verified.bankCode,
    });
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
    let goal = body.goal_id ? getGoalById(req.user.id, body.goal_id) : null;

    let mandateReference = null;
    if (body.recurring_amount_kobo > 0) {
      const mandate = await createDirectDebitMandate({
        customerName: req.user.full_name,
        customerEmail: req.user.email,
        amount: body.recurring_amount_kobo,
        mandateReference: `ZURI-MD-${randomUUID()}`,
      });
      mandateReference = mandate.mandateReference;
    }

    if (goal) {
      if (body.target_amount_kobo) goal.target_amount_kobo = body.target_amount_kobo;
      if (body.target_date) goal.target_date = body.target_date;
      if (body.recurring_amount_kobo !== undefined) goal.recurring_amount_kobo = body.recurring_amount_kobo;
      if (mandateReference) goal.monnify_mandate_ref = mandateReference;
      goal.status = 'active';
      updateGoal(goal);
    } else {
      goal = {
        id: randomUUID(),
        user_id: req.user.id,
        name: body.name,
        target_amount_kobo: body.target_amount_kobo,
        target_date: body.target_date,
        current_amount_kobo: 0,
        recurring_amount_kobo: body.recurring_amount_kobo || 0,
        monnify_mandate_ref: mandateReference,
        status: 'active',
        created_at: new Date().toISOString(),
      };
      insertGoal(goal);
    }

    let text = `Done. I've created your ${goal.name} goal.`;
    let spokenText = text;
    if (body.recurring_amount_kobo > 0) {
      text = `Done. I'll pull ${formatNaira(body.recurring_amount_kobo)} every month into ${goal.name} via direct debit.`;
      spokenText = `Done. I'll pull ${formatSpokenNaira(body.recurring_amount_kobo)} every month into ${goal.name} via direct debit.`;
    }

    const tts = await textToSpeech(spokenText, req.user.language_pref);

    const msg = pushConversation({
      user_id: req.user.id,
      role: 'zuri',
      text,
      language: req.user.language_pref,
      intent: 'goal_created',
      audio_url: tts.audioUrl,
    });

    res.json({
      goal,
      mandate,
      message: msg,
      spoken: text,
      audioUrl: tts.audioUrl,
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
    name: req.body.name || 'Untitled Automation',
    trigger_type: req.body.trigger_type || 'inbound_credit',
    trigger_config: req.body.trigger_config || {},
    action_type: req.body.action_type || 'skim_to_goal',
    action_config: req.body.action_config || {},
    active: true,
    created_at: new Date().toISOString(),
  };
  insertAutomation(row);
  res.status(201).json({ automation: row });
});

router.patch('/goals/:id', (req, res) => {
  const goal = getGoalById(req.user.id, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  if (req.body.status) goal.status = req.body.status;
  if (req.body.name) goal.name = req.body.name;
  if (req.body.target_amount_kobo !== undefined) goal.target_amount_kobo = req.body.target_amount_kobo;
  if (req.body.recurring_amount_kobo !== undefined) goal.recurring_amount_kobo = req.body.recurring_amount_kobo;
  updateGoal(goal);
  res.json({ goal });
});

router.post('/goals/:id/deposit', async (req, res) => {
  if (!requirePin(req, res)) return;
  const goal = getGoalById(req.user.id, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const amount = parseInt(req.body.amount_kobo, 10);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  
  if (req.user.current_balance_kobo < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  adjustBalance(req.user.id, -amount);
  goal.current_amount_kobo += amount;
  updateGoal(goal);

  upsertTransaction({
    user_id: req.user.id,
    amount_kobo: amount,
    direction: 'OUT',
    monnify_ref: `GOAL-DEP-${Date.now()}`,
    status: 'SUCCESSFUL',
    narration: `Deposit to ${goal.name}`,
    category: 'goal',
    counterparty_name: null,
    counterparty_bank: null,
    occurred_at: new Date().toISOString(),
  });

  res.json({ goal });
});

router.post('/goals/:id/withdraw', async (req, res) => {
  if (!requirePin(req, res)) return;
  const goal = getGoalById(req.user.id, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  
  let amount = req.body.amount_kobo;
  if (amount === 'ALL') amount = goal.current_amount_kobo;
  else amount = parseInt(amount, 10);
  
  if (isNaN(amount) || amount <= 0 || amount > goal.current_amount_kobo) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  goal.current_amount_kobo -= amount;
  updateGoal(goal);
  adjustBalance(req.user.id, amount);

  upsertTransaction({
    user_id: req.user.id,
    amount_kobo: amount,
    direction: 'IN',
    monnify_ref: `GOAL-WTH-${Date.now()}`,
    status: 'SUCCESSFUL',
    narration: `Withdrawal from ${goal.name}`,
    category: 'goal',
    counterparty_name: null,
    counterparty_bank: null,
    occurred_at: new Date().toISOString(),
  });

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
