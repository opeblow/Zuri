import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { updateUser, deleteUserData } from '../db/store.js';
import { authRequired, verifyPin } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(authRequired);

/**
 * PATCH /settings/profile
 * Update language preference and biometric limit.
 */
const profileSchema = z.object({
  language_pref: z.enum(['en', 'yo', 'pcm', 'ig', 'ha']).optional(),
  daily_biometric_limit_kobo: z.number().int().positive().max(10_000_000).optional(),
  biometric_enabled: z.boolean().optional(),
});

router.patch('/profile', (req, res) => {
  try {
    const body = profileSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const user = updateUser(req.user.id, body);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      ok: true,
      user: {
        language_pref: user.language_pref,
        daily_biometric_limit_kobo: user.daily_biometric_limit_kobo,
        biometric_enabled: user.biometric_enabled,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /settings/change-pin
 * Requires current PIN before accepting a new one.
 */
const changePinSchema = z.object({
  current_pin: z.string().regex(/^\d{4}$/),
  new_pin: z.string().regex(/^\d{4}$/),
});

router.patch('/change-pin', (req, res) => {
  try {
    const body = changePinSchema.parse(req.body);
    if (!verifyPin(req.user, body.current_pin)) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }
    if (body.current_pin === body.new_pin) {
      return res.status(400).json({ error: 'New PIN must be different' });
    }
    const cost = Number(process.env.BCRYPT_COST || 12);
    const pin_hash = bcrypt.hashSync(body.new_pin, cost);
    updateUser(req.user.id, { pin_hash });

    logger.info({ userId: req.user.id }, 'PIN changed');
    res.json({ ok: true, message: 'PIN updated successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /settings/account
 * Cascade-delete all user data. Requires PIN confirmation.
 */
router.delete('/account', (req, res) => {
  if (!verifyPin(req.user, req.body?.pin)) {
    return res.status(401).json({ error: 'PIN required to delete account' });
  }
  deleteUserData(req.user.id);
  logger.info({ userId: req.user.id }, 'Account deleted');
  res.json({ ok: true, message: 'Account and all data have been deleted' });
});

export default router;
