import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import beneficiaryRoutes from './routes/beneficiaries.js';
import accountRoutes from './routes/account.js';
import conversationRoutes from './routes/conversation.js';
import actionRoutes from './routes/actions.js';
import settingsRoutes from './routes/settings.js';
import webhookRoutes, { proactiveBus, processInboundCredit } from './routes/webhooks.js';
import { authRequired } from './middleware/auth.js';
import { seedDemoAccount } from './db/seed.js';
import { findUserByPhone, getAccountForUser } from './db/store.js';
import { logger } from './lib/logger.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));

// Preserve raw body for webhook HMAC
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'Zuri',
    tagline: 'Your money, out loud.',
    demo_mode: process.env.DEMO_MODE !== 'false',
  });
});

app.use('/auth', authRoutes);
app.use('/beneficiaries', beneficiaryRoutes);
app.use('/', accountRoutes);
app.use('/conversation', conversationRoutes);
app.use('/actions', actionRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/settings', settingsRoutes);

/** SSE stream for proactive Zuri (salary-landed etc.) */
app.get('/events/stream', authRequired, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userId = req.user.id;
  if (!proactiveBus.has(userId)) proactiveBus.set(userId, new Set());
  proactiveBus.get(userId).add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  req.on('close', () => {
    proactiveBus.get(userId)?.delete(res);
  });
});

/** Convenience: reset + reseed demo */
app.post('/demo/reset', (_req, res) => {
  const { user } = seedDemoAccount();
  const account = getAccountForUser(user.id);
  res.json({
    ok: true,
    login: { phone: '08012345678', pin: '1234' },
    user_id: user.id,
    account,
  });
});

app.post('/demo/salary-landed', authRequired, (req, res) => {
  const amount = req.body?.amount_kobo || 45_000_000;
  const result = processInboundCredit(req.user.id, {
    amountKobo: amount,
    sourceName: 'Design Corp Ltd',
    monnifyRef: `DEMO-SALARY-${Date.now()}`,
    event: 'SUCCESSFUL_TRANSACTION',
  });
  res.json(result);
});

// Boot
seedDemoAccount();
const demoUser = findUserByPhone('08012345678');

app.listen(PORT, () => {
  logger.info(`Zuri API listening on http://localhost:${PORT}`);
  logger.info(`Demo login → phone 08012345678 / PIN 1234 (user ${demoUser?.id})`);
});
