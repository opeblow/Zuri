import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { findUserById } from '../db/store.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, phone: user.phone },
    process.env.JWT_SECRET || 'zuri-dev-secret',
    { expiresIn: '7d' },
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'zuri-dev-secret');
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function verifyPin(user, pin) {
  if (!pin || String(pin).length !== 4) return false;
  return bcrypt.compareSync(String(pin), user.pin_hash);
}
