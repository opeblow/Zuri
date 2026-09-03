import { Router } from 'express';
import {
  adjustBalance,
  findUserById,
  getAccountForUser,
  getDb,
  listAutomations,
  pushConversation,
  upsertTransaction,
} from '../db/store.js';
import { verifyMonnifySignature } from '../services/monnify.js';
import { buildMemorySnapshot } from '../services/memory.js';
import { buildSalaryLandedMessage, buildInboundTransferMessage, textToSpeech } from '../services/ai.js';
import { logger } from '../lib/logger.js';

const router = Router();

/** In-memory SSE subscribers per user for proactive Zuri */
export const proactiveBus = new Map();

export function pushProactive(userId, payload) {
  const set = proactiveBus.get(userId);
  if (!set) return;
  for (const res of set) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

/**
 * POST /webhooks/monnify
 * Signature check is ALWAYS first. Idempotent UPSERT on monnify_ref.
 */
router.post('/monnify', async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const hash = req.headers['monnify-signature'] || req.headers['x-monnify-signature'] || '';

  console.log(rawBody)

  if (!verifyMonnifySignature(rawBody, hash)) {
    logger.warn('Rejected webhook — bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body?.eventType || req.body?.event || '';
  const body = req.body?.eventData || req.body?.data || req.body;

  // Demo helper: { demo_user_id, amount_kobo, source_name, eventType }
  const userId = body.demo_user_id || body.customerReference || null;
  const amountKobo = Number(body.amount_kobo ?? Math.round((body.amountPaid || body.amount || 0) * 100));
  const sourceName = body.source_name || body.paymentSourceInformation?.[0]?.accountName || body.product?.reference || 'Inbound credit';
  const monnifyRef = body.transactionReference || body.paymentReference || `WH-${Date.now()}`;
  
  if (!userId) {
    // Try match reserved account
    const accountNumber = body.destinationAccountInformation?.accountNumber || body.destinationAccountNumber || body.accountNumber;
    const account = getDb().prepare('SELECT * FROM accounts WHERE monnify_reserved_account = ?').get(accountNumber);
    console.log("Found account:", account);
    if (!account) {
      logger.info({ event }, 'Webhook with no matching user — ack');
      return res.json({ ok: true, matched: false });
    }
    return await handleInbound(account.user_id, {
      amountKobo,
      sourceName,
      monnifyRef,
      event,
    }, res);
  }

  return await handleInbound(userId, { amountKobo, sourceName, monnifyRef, event }, res);
});

async function handleInbound(userId, { amountKobo, sourceName, monnifyRef, event }, res) {
  const user = findUserById(userId);
  if (!user) return res.json({ ok: true, matched: false });

  const { row, created } = upsertTransaction({
    user_id: userId,
    monnify_ref: monnifyRef,
    direction: 'inbound',
    amount_kobo: amountKobo,
    counterparty_name: sourceName,
    counterparty_bank: 'Monnify',
    narration: event || 'Inbound',
    category: /design corp|salary/i.test(sourceName) ? 'salary' : 'other',
    status: 'settled',
    occurred_at: new Date().toISOString(),
  });

  if (created) {
    adjustBalance(userId, amountKobo);

    // Evaluate skim automations
    for (const auto of listAutomations(userId)) {
      if (auto.trigger_type !== 'inbound_credit') continue;
      const contains = auto.trigger_config?.source_contains;
      if (contains && !new RegExp(contains, 'i').test(sourceName)) continue;
      if (auto.action_type === 'skim_to_goal') {
        const pct = auto.action_config?.percentage || 0;
        const goal = getDb().prepare('SELECT * FROM goals WHERE id = ?').get(auto.action_config?.goal_id);
        if (goal && pct > 0) {
          const skim = Math.round((amountKobo * pct) / 100);
          getDb().prepare('UPDATE goals SET current_amount_kobo = current_amount_kobo + ? WHERE id = ?').run(skim, goal.id);
          // skim is allocation bookkeeping in demo (already in balance)
        }
      }
    }
  }

  const memory = buildMemorySnapshot(user);
  let proactive = null;

  if (created) {
    let text = '';
    let spoken_text = '';
    let intent = '';
    if (row.category === 'salary') {
      const msg = buildSalaryLandedMessage(user, amountKobo, memory);
      text = msg.text;
      spoken_text = msg.spoken_text;
      intent = 'salary_landed';
    } else {
      const msg = buildInboundTransferMessage(user, amountKobo, sourceName, memory);
      text = msg.text;
      spoken_text = msg.spoken_text;
      intent = 'inbound_transfer';
    }
    
    const tts = await textToSpeech(spoken_text, user.language_pref);
    
    proactive = pushConversation({
      user_id: userId,
      role: 'zuri',
      text,
      language: user.language_pref,
      intent,
      audio_url: tts.audioUrl,
    });
    
    // Inject spoken_text into the proactive message payload for the frontend TTS
    proactive.spoken_text = spoken_text;
    
    pushProactive(userId, { type: 'proactive_message', message: proactive });
  }

  if (created && !proactive) {
    pushProactive(userId, { type: 'refresh' });
  }

  logger.info({ monnifyRef, created, userId }, 'Webhook processed');
  res.json({ ok: true, created, transaction: row, proactive });
}

/** Shared inbound processor for webhooks + demo triggers */
export async function processInboundCredit(userId, { amountKobo, sourceName, monnifyRef, event }) {
  const fakeRes = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  await handleInbound(userId, { amountKobo, sourceName, monnifyRef, event }, fakeRes);
  return fakeRes.body;
}

export default router;
