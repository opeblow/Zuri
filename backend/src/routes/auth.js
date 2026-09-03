import { Router } from 'express';
import { z } from 'zod';
import {
  createAccount,
  createUser,
  findUserByPhone,
} from '../db/store.js';
import { authRequired, signToken, verifyPin } from '../middleware/auth.js';
import { createReservedAccount } from '../services/monnify.js';
import { logger } from '../lib/logger.js';

const router = Router();

const signupSchema = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email(),
  full_name: z.string().min(2),
  language_pref: z.enum(['en', 'yo', 'pcm', 'ig', 'ha']).default('en'),
  pin: z.string().regex(/^\d{4}$/),
});

router.post('/signup', async (req, res) => {
  try {
    const body = signupSchema.parse(req.body);
    if (findUserByPhone(body.phone)) {
      return res.status(409).json({ error: 'Phone already registered' });
    }

    const user = createUser(body);
    const accountRef = `ZURI-${user.id.replace(/-/g, '').slice(0, 12)}`;
    const reserved = await createReservedAccount({
      accountReference: accountRef,
      accountName: `Zuri/${body.full_name}`,
      customerEmail: body.email,
      customerName: body.full_name,
    });

    const account = createAccount(user.id, {
      monnify_reserved_account: reserved.accountNumber,
      monnify_account_ref: reserved.accountReference,
      bank_name: reserved.bankName,
      balance_kobo: 0,
    });

    const token = signToken(user);
    logger.info({ userId: user.id }, 'User signed up + reserved account provisioned');

    res.status(201).json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        full_name: user.full_name,
        language_pref: user.language_pref,
        biometric_enabled: user.biometric_enabled,
      },
      account: {
        reserved_account: account.monnify_reserved_account,
        bank_name: account.bank_name,
        balance_kobo: account.balance_kobo,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    logger.error(err);
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

router.post('/login', (req, res) => {
  const { phone, pin } = req.body || {};
  const user = findUserByPhone(phone);
  if (!user || !verifyPin(user, pin)) {
    return res.status(401).json({ error: 'Invalid phone or PIN' });
  }
  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      full_name: user.full_name,
      language_pref: user.language_pref,
      biometric_enabled: user.biometric_enabled,
      daily_biometric_limit_kobo: user.daily_biometric_limit_kobo,
    },
  });
});

router.post('/verify-pin', authRequired, (req, res) => {
  const { pin } = req.body || {};
  if (!verifyPin(req.user, pin)) {
    return res.status(401).json({ error: 'Incorrect PIN', verified: false });
  }
  res.json({ verified: true });
});

export default router;
