import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { listConversations, pushConversation } from '../db/store.js';
import { authRequired } from '../middleware/auth.js';
import { reasonOverTranscript, speechToText, textToSpeech } from '../services/ai.js';
import { logger } from '../lib/logger.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const router = Router();

const conversationLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

router.use(authRequired);

router.get('/history', (req, res) => {
  res.json({ messages: listConversations(req.user.id) });
});

/**
 * Core conversation handler.
 * LLM reasoning + TTS generation are awaited so text and audio arrive together.
 */
async function runConversation(req, res, transcript, { fromAudio = false, voice = null } = {}) {
  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: 'Empty transcript' });
  }

  pushConversation({
    user_id: req.user.id,
    role: 'user',
    text: transcript,
    language: req.user.language_pref,
    intent: null,
    audio_url: fromAudio ? 'uploaded' : null,
  });

  const history = listConversations(req.user.id).slice(-10);
  const { decision, memory } = await reasonOverTranscript(req.user, transcript, history);
  const tts = await textToSpeech(decision.spoken_text || decision.reply_text, decision.language, voice);

  const zuriMsg = pushConversation({
    user_id: req.user.id,
    role: 'zuri',
    text: decision.reply_text,
    language: decision.language,
    intent: decision.action,
    audio_url: tts.audioUrl,
  });

  res.json({
    transcript,
    decision,
    memory_preview: {
      balance_kobo: memory.user.current_balance_kobo,
      goals: memory.goals.length,
      beneficiaries: memory.beneficiaries.map((b) => b.nickname),
    },
    message: zuriMsg,
    tts,
  });
}

/**
 * Standard POST /text endpoint.
 */
router.post('/text', conversationLimiter, async (req, res) => {
  try {
    await runConversation(req, res, req.body?.text, { voice: req.body?.voice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * SSE streaming endpoint for conversation responses.
 * Sends a "thinking" status immediately, then delivers decision + audio together.
 */
router.post('/text-stream', conversationLimiter, async (req, res) => {
  const transcript = req.body?.text;
  const voice = req.body?.voice || null;

  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: 'Empty transcript' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  /** Helper to send an SSE event */
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Immediately acknowledge — frontend stops showing "thinking" spinner idle
    sendEvent('status', { phase: 'thinking' });

    pushConversation({
      user_id: req.user.id,
      role: 'user',
      text: transcript,
      language: req.user.language_pref,
      intent: null,
      audio_url: null,
    });

    const history = listConversations(req.user.id).slice(-10);
    const { decision, memory } = await reasonOverTranscript(req.user, transcript, history);

    // Await TTS so text + audio arrive together
    const tts = await textToSpeech(decision.spoken_text || decision.reply_text, decision.language, voice);

    const zuriMsg = pushConversation({
      user_id: req.user.id,
      role: 'zuri',
      text: decision.reply_text,
      language: decision.language,
      intent: decision.action,
      audio_url: tts.audioUrl,
    });

    // Send decision + audio in a single event
    sendEvent('decision', {
      transcript,
      decision,
      memory_preview: {
        balance_kobo: memory.user.current_balance_kobo,
        goals: memory.goals.length,
        beneficiaries: memory.beneficiaries.map((b) => b.nickname),
      },
      message: zuriMsg,
      tts,
    });

    sendEvent('done', { ok: true });
    res.end();
  } catch (err) {
    logger.error({ err }, 'SSE conversation stream error');
    sendEvent('error', { error: err.message });
    res.end();
  }
});

/**
 * Audio upload endpoint.
 */
router.post('/audio', conversationLimiter, upload.single('audio'), async (req, res) => {
  try {
    // Allow transcript override for demos without Whisper
    if (req.body?.transcript) {
      return runConversation(req, res, req.body.transcript, { fromAudio: true, voice: req.body?.voice });
    }
    if (!req.file) return res.status(400).json({ error: 'audio file required' });

    const stt = await speechToText(req.file.buffer, req.file.originalname);
    if (!stt.text) {
      return res.status(422).json({
        error: 'Speech recognition unavailable in demo without OPENAI_API_KEY',
        hint: 'Send transcript alongside audio, or use /conversation/text',
        stt,
      });
    }
    if (stt.confidence < 0.85) {
      const clarify = `I didn't catch that clearly — did you say: "${stt.text}"?`;
      const tts = await textToSpeech(clarify, 'en', req.body?.voice);
      const msg = pushConversation({
        user_id: req.user.id,
        role: 'zuri',
        text: clarify,
        language: 'en',
        intent: 'ask_clarify',
        audio_url: tts.audioUrl,
      });
      return res.json({ needs_confirm_transcript: true, stt, message: msg, tts });
    }
    await runConversation(req, res, stt.text, { fromAudio: true, voice: req.body?.voice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
