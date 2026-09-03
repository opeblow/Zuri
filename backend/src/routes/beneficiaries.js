import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getDb, listBeneficiaries, insertBeneficiary, deleteBeneficiary } from '../db/store.js';
import { authRequired } from '../middleware/auth.js';
import { NIGERIAN_BANKS, verifyBankAccount } from '../services/monnify.js';

const router = Router();

router.get('/banks', (_req, res) => {
  res.json({ banks: NIGERIAN_BANKS });
});

router.get('/', authRequired, (req, res) => {
  res.json({ beneficiaries: listBeneficiaries(req.user.id) });
});

router.post('/', authRequired, async (req, res) => {
  try {
    const schema = z.object({
      nickname: z.string().min(1).max(40),
      account_number: z.string().min(10).max(10),
      bank_code: z.string().min(3),
    });
    const body = schema.parse(req.body);
    const verified = await verifyBankAccount({
      accountNumber: body.account_number,
      bankCode: body.bank_code,
    });
    const bank = NIGERIAN_BANKS.find((b) => b.code === body.bank_code);

    const row = {
      id: randomUUID(),
      user_id: req.user.id,
      nickname: body.nickname,
      full_name: verified.accountName,
      account_number: body.account_number,
      bank_code: body.bank_code,
      bank_name: bank?.name || 'Bank',
      last_sent_at: null,
      send_count: 0,
      created_at: new Date().toISOString(),
    };
    insertBeneficiary(row);
    res.status(201).json({
      beneficiary: row,
      verification: { accountName: verified.accountName, confirmed: true },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authRequired, (req, res) => {
  if (!deleteBeneficiary(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ ok: true });
});

export default router;
