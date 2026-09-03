import { z } from 'zod';
import { buildMemorySnapshot, formatNaira } from './memory.js';
import { logger } from '../lib/logger.js';

/**
 * Strict schema — LLM must never free-text into money movement.
 */
export const DecisionSchema = z.object({
  action: z.enum([
    'none',
    'check_balance',
    'spending_insight',
    'advice',
    'transfer',
    'bulk_transfer',
    'create_goal',
    'setup_direct_debit',
    'ask_clarify',
    'cannot_help',
  ]),
  amount_kobo: z.number().int().nonnegative().nullable().optional(),
  recipient_ref: z.string().nullable().optional(),
  goal_ref: z.string().nullable().optional(),
  language: z.enum(['en', 'yo', 'pcm', 'ig', 'ha']).default('en'),
  confidence: z.number().min(0).max(1),
  reply_text: z.string(),
  requires_confirmation: z.boolean().default(true),
  pending_action: z
    .object({
      type: z.string(),
      payload: z.record(z.any()),
    })
    .nullable()
    .optional(),
});

const SYSTEM_RULES = `
You are Zuri, a conversational Nigerian money coach.
Rules:
1) Always confirm before executing money movement.
2) Never invent account numbers — only use beneficiaries from memory.
3) Ground advice in the memory numbers; do not guess.
4) Reply in the same language the user used (en/yo/pcm).
5) Return structured JSON only matching the schema.
`;

function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/[ṣẹọáíúàèìòùń]|ṣé|mo ní|owó|báyìí|rá|tuntun|jẹ́/.test(t) || /ṣe |naira|owo/.test(t)) {
    if (/ṣé|owó|báyìí|tuntun|mo ní|rà/.test(t)) return 'yo';
  }
  if (/\b(abeg|wetin|how far|na|una|dey|fit|sabi|chop)\b/i.test(text)) return 'pcm';
  return 'en';
}

/** Independent regex amount parse (safety: compare with LLM amount). */
export function parseAmountRegex(text) {
  const normalized = text
    .replace(/,/g, '')
    .replace(/₦\s*/g, 'ngn ');
  const m =
    normalized.match(/(?:ngn|naira|₦)?\s*([\d]+(?:\.\d+)?)\s*(k|thousand|m|million)?/i) ||
    normalized.match(/([\d]+(?:\.\d+)?)\s*(k|thousand|m|million)?\s*(?:naira|ngn)/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') n *= 1000;
  if (unit === 'm' || unit === 'million') n *= 1_000_000;
  // Heuristic: bare numbers like 5000 mean naira; very small like 5 with "k" already handled
  if (n < 100 && !unit && /naira|ngn|₦|thousand|k\b/i.test(text) === false) {
    // "send 5 to mummy" unlikely; skip
  }
  return Math.round(n * 100); // kobo
}

function findBeneficiary(memory, ref) {
  if (!ref) return null;
  const needle = ref.toLowerCase();
  return memory.beneficiaries.find(
    (b) =>
      b.nickname.toLowerCase() === needle ||
      b.full_name.toLowerCase().includes(needle) ||
      needle.includes(b.nickname.toLowerCase()),
  );
}

/**
 * Demo reasoning engine — handles the three killer moments + core intents
 * without requiring Anthropic/OpenAI keys. Same DecisionSchema as live LLM.
 */
function demoReason(transcript, memory) {
  const text = transcript.trim();
  const language = detectLanguage(text);
  const lower = text.toLowerCase();
  const regexAmount = parseAmountRegex(text);

  // Moment 3 — Yoruba phone affordability
  if (
    language === 'yo' ||
    /phone tuntun|owó tí mo lè|ṣé mo ní|ra phone|buy.*(phone|iphone)/i.test(text)
  ) {
    const rent = memory.goals.find((g) => /rent/i.test(g.name));
    const balance = memory.user.current_balance_kobo;
    const monthlyRent = rent?.monthly ?? 9_000_000;
    const availableAfterCommit = balance - monthlyRent;
    const canBuyCheap = availableAfterCommit > 15_000_000;

    let reply_text;
    if (language === 'yo') {
      reply_text = canBuyCheap
        ? `Mo ri ${formatNaira(balance)} lórí account rẹ. Ṣùgbọ́n owó iyẹ̀wù (${formatNaira(monthlyRent)}/oṣù) ṣì wà. Ohun tí o lè ná nísinsìnyí jẹ́ nǹkan bí ${formatNaira(Math.max(availableAfterCommit, 0))} — phone tuntun tán kan tóòó tó ${formatNaira(20_000_000)} máa ṣe sense; eyí tó ga ju bẹ́ẹ̀ lọ yóò ba àfojúsùn iyẹ̀wù jẹ́.`
        : `Ní ${formatNaira(balance)}, kò tó láti ra phone tuntun lẹ́yìn tí a bá yọ̀ọ́ ${formatNaira(monthlyRent)} fún iyẹ̀wù. Jẹ́ ká tẹ̀ síwájú pẹ̀lú àfojúsùn Rent kí o tó ra phone.`;
    } else {
      reply_text = canBuyCheap
        ? `You have ${formatNaira(balance)}. After your rent contribution of ${formatNaira(monthlyRent)}, you'd have about ${formatNaira(Math.max(availableAfterCommit, 0))} free. A modest phone around ₦200k could work — anything much higher will pressure the rent goal.`
        : `With ${formatNaira(balance)}, you're short after reserving ${formatNaira(monthlyRent)} for rent. I'd hold off on the phone until the rent goal is healthier.`;
    }

    return DecisionSchema.parse({
      action: 'advice',
      language,
      confidence: 0.93,
      reply_text,
      requires_confirmation: false,
      amount_kobo: null,
      recipient_ref: null,
    });
  }

  // Moment 1 — Rent planning
  if (/rent|iyẹ̀wù|iye wu|how should i pay/i.test(lower)) {
    const rentTarget = parseAmountRegex(text) || 90_000_000;
    const monthsLeft = Math.max(1, monthsUntil('2026-11-01'));
    const monthly = Math.ceil(rentTarget / monthsLeft / 100) * 100;
    const salary = memory.salary_pattern.typical_amount_kobo;
    const share = Math.round((monthly / salary) * 100);
    const existing = memory.goals.find((g) => /rent/i.test(g.name));

    const reply_text =
      language === 'pcm'
        ? `Your rent na ${formatNaira(rentTarget)} for November. Based on how your ${formatNaira(salary)} salary dey land around the ${memory.salary_pattern.typical_day_of_month}th, I fit set ${formatNaira(monthly)} every month (${share}% of salary). You already get ${formatNaira(existing?.current_kobo || 0)} for the rent pot. Make I set up the monthly direct debit?`
        : `Your rent is ${formatNaira(rentTarget)} due in November — about ${monthsLeft} months left. Looking at your ${formatNaira(salary)} salary rhythm (around the ${memory.salary_pattern.typical_day_of_month}th), I'd set aside ${formatNaira(monthly)} each month — roughly ${share}% of salary. You've already saved ${formatNaira(existing?.current_kobo || 0)} toward it. Want me to set up an automatic monthly direct debit for that?`;

    return DecisionSchema.parse({
      action: 'setup_direct_debit',
      amount_kobo: monthly,
      goal_ref: existing?.name || 'Rent 2027',
      language,
      confidence: 0.95,
      reply_text,
      requires_confirmation: true,
      pending_action: {
        type: 'create_goal_mandate',
        payload: {
          name: existing?.name || 'Rent 2027',
          target_amount_kobo: rentTarget,
          target_date: '2026-11-01',
          recurring_amount_kobo: monthly,
          goal_id: existing?.id || null,
        },
      },
    });
  }

  // Transfer intent
  if (/\b(send|transfer|pay|wire|give)\b/i.test(lower) || /\bfi (ransome|ranṣẹ|ransẹ)\b/i.test(lower)) {
    const nickMatch =
      text.match(/(?:to|give|send)\s+([A-Za-zÀ-ÿ]+)/i) ||
      text.match(/\b(mummy|mama|ada|landlord)\b/i);
    const recipient_ref = nickMatch ? nickMatch[1] : null;
    const bene = findBeneficiary(memory, recipient_ref);
    const amount_kobo = regexAmount;

    if (!bene) {
      return DecisionSchema.parse({
        action: 'ask_clarify',
        language,
        confidence: 0.7,
        reply_text:
          language === 'pcm'
            ? 'I no sabi who that person be o. Save them as beneficiary first, then talk to me again.'
            : "I can only send to people you've already saved. Add them as a beneficiary first, then ask me again.",
        requires_confirmation: false,
      });
    }

    if (!amount_kobo) {
      return DecisionSchema.parse({
        action: 'ask_clarify',
        language,
        confidence: 0.75,
        reply_text: `How much should I send to ${bene.nickname}?`,
        requires_confirmation: false,
        recipient_ref: bene.nickname,
      });
    }

    // Anomaly: >3× usual
    const unusual = amount_kobo > bene.usual_amount_kobo * 3;
    const firstSend = bene.send_count === 0;
    let reply_text = `I'll send ${formatNaira(amount_kobo)} to ${bene.full_name} (${bene.bank_name}). Confirm with your PIN to go ahead.`;
    if (unusual) {
      reply_text = `That's more than 3× what you usually send ${bene.nickname}. Just checking — ${formatNaira(amount_kobo)} to ${bene.full_name}. Enter your PIN if that's right.`;
    }
    if (firstSend) {
      reply_text = `First time sending to ${bene.full_name}. Cap on first sends is ₦20,000. Confirm with PIN to send ${formatNaira(Math.min(amount_kobo, 2_000_000))}.`;
    }

    return DecisionSchema.parse({
      action: 'transfer',
      amount_kobo: firstSend ? Math.min(amount_kobo, 2_000_000) : amount_kobo,
      recipient_ref: bene.nickname,
      language,
      confidence: 0.94,
      reply_text,
      requires_confirmation: true,
      pending_action: {
        type: 'transfer',
        payload: {
          beneficiary_id: bene.id,
          amount_kobo: firstSend ? Math.min(amount_kobo, 2_000_000) : amount_kobo,
          unusual,
        },
      },
    });
  }

  // Balance
  if (/balance|how much.*(have|left)|owo mi|ẹ̀yìn mi/i.test(lower)) {
    return DecisionSchema.parse({
      action: 'check_balance',
      language,
      confidence: 0.98,
      reply_text:
        language === 'yo'
          ? `Owó tó wà lórí account rẹ jẹ́ ${formatNaira(memory.user.current_balance_kobo)}.`
          : language === 'pcm'
            ? `Your balance na ${formatNaira(memory.user.current_balance_kobo)}.`
            : `Your available balance is ${formatNaira(memory.user.current_balance_kobo)}.`,
      requires_confirmation: false,
    });
  }

  // Spending / Bolt
  if (/spent|spending|bolt|food|transport|chop/i.test(lower)) {
    const cat = /bolt|transport/i.test(lower)
      ? 'transport'
      : /food|chop/i.test(lower)
        ? 'food'
        : /family|mummy|mama/i.test(lower)
          ? 'family'
          : null;
    const cats = memory.recent_categories;
    let reply_text;
    if (cat === 'transport') {
      reply_text = `This month you've spent ${formatNaira(cats.transport_last_30d_kobo)} on transport (including Bolt). That's about ${Math.round((cats.transport_last_30d_kobo / memory.salary_pattern.typical_amount_kobo) * 100)}% of your typical salary.`;
    } else if (cat === 'food') {
      reply_text = `Food is at ${formatNaira(cats.food_last_30d_kobo)} over the last 30 days.`;
    } else {
      reply_text = `Last 30 days — food ${formatNaira(cats.food_last_30d_kobo)}, transport ${formatNaira(cats.transport_last_30d_kobo)}, family ${formatNaira(cats.family_last_30d_kobo)}, savings ${formatNaira(cats.savings_last_30d_kobo)}.`;
    }
    return DecisionSchema.parse({
      action: 'spending_insight',
      language,
      confidence: 0.92,
      reply_text,
      requires_confirmation: false,
    });
  }

  return DecisionSchema.parse({
    action: 'ask_clarify',
    language,
    confidence: 0.55,
    reply_text:
      "I can check your balance, explain spending, plan goals like rent, or send money to people you've saved. What do you want to do?",
    requires_confirmation: false,
  });
}

function monthsUntil(isoDate) {
  const target = new Date(isoDate);
  const now = new Date();
  return Math.max(
    1,
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
  );
}

async function liveLlmReason(transcript, memory) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (process.env.ANTHROPIC_API_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `${SYSTEM_RULES}\n\nMemory:\n${JSON.stringify(memory)}`,
        messages: [
          {
            role: 'user',
            content: `User said: """${transcript}"""\nRespond with JSON only matching DecisionSchema fields: action, amount_kobo, recipient_ref, goal_ref, language, confidence, reply_text, requires_confirmation, pending_action.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Anthropic failed — falling back to demo reasoner');
      return null;
    }
    const data = await res.json();
    const text = data.content?.map((c) => c.text).join('') || '';
    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    return DecisionSchema.parse(json);
  }

  // OpenAI path
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM_RULES}\nMemory:\n${JSON.stringify(memory)}` },
        {
          role: 'user',
          content: `User said: """${transcript}""". Return DecisionSchema JSON.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'OpenAI failed — falling back');
    return null;
  }
  const data = await res.json();
  return DecisionSchema.parse(JSON.parse(data.choices[0].message.content));
}

/**
 * Main Mind entry: transcript + user → validated decision.
 */
export async function reasonOverTranscript(user, transcript) {
  const memory = buildMemorySnapshot(user);
  const regexAmount = parseAmountRegex(transcript);

  let decision = await liveLlmReason(transcript, memory);
  if (!decision) decision = demoReason(transcript, memory);

  // Double-parse amounts: if regex and decision disagree on transfer, ask
  if (
    decision.action === 'transfer' &&
    regexAmount &&
    decision.amount_kobo &&
    Math.abs(regexAmount - decision.amount_kobo) > 100
  ) {
    decision = DecisionSchema.parse({
      ...decision,
      action: 'ask_clarify',
      confidence: 0.4,
      requires_confirmation: false,
      pending_action: null,
      reply_text: `I heard two different amounts. Did you mean ${formatNaira(regexAmount)} or ${formatNaira(decision.amount_kobo)}?`,
    });
  }

  if (decision.confidence < 0.9 && decision.action !== 'ask_clarify') {
    decision.requires_confirmation = true;
    decision.reply_text = `${decision.reply_text} (Just confirming I heard you right.)`;
  }

  return { decision, memory };
}

/** STT — Whisper when keyed, else treat uploaded filename/text fallback */
export async function speechToText(buffer, filename = 'audio.webm') {
  if (!process.env.OPENAI_API_KEY) {
    return {
      text: null,
      language: 'en',
      confidence: 0,
      demo: true,
      message: 'No OPENAI_API_KEY — use text conversation or set whisper key.',
    };
  }
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error('Whisper transcription failed');
  const data = await res.json();
  return { text: data.text, language: data.language || 'en', confidence: 0.9, demo: false };
}

/** TTS — ElevenLabs when keyed; else return null (frontend uses speechSynthesis) */
export async function textToSpeech(text, language = 'en') {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    return { audioUrl: null, cached: false, fallback: 'browser' };
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: language === 'en' ? 'eleven_monolingual_v1' : 'eleven_multilingual_v2',
      }),
    },
  );
  if (!res.ok) return { audioUrl: null, cached: false, fallback: 'browser' };
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  return { audioUrl: `data:audio/mpeg;base64,${b64}`, cached: false, fallback: null };
}

/**
 * Builds the proactive "salary landed" spoken moment (Moment 2).
 */
export function buildSalaryLandedMessage(user, amountKobo, memory) {
  const rent = memory.goals.find((g) => /rent/i.test(g.name));
  const tax = memory.goals.find((g) => /tax/i.test(g.name));
  const mummy = memory.beneficiaries.find((b) => /mummy/i.test(b.nickname));
  const rentBit = rent ? formatNaira(rent.monthly) : formatNaira(9_000_000);
  const mummyBit = mummy ? formatNaira(5_000_000) : formatNaira(5_000_000);
  const taxBit = tax ? formatNaira(tax.monthly || 4_000_000) : formatNaira(4_000_000);
  const committed = (rent?.monthly || 9_000_000) + 5_000_000 + (tax?.monthly || 4_000_000);
  const available = amountKobo + memory.user.current_balance_kobo - committed;

  return `Your salary just landed — ${formatNaira(amountKobo)}. Before you do anything, here's what's already committed: ${rentBit} to your rent goal, ${mummyBit} for Mum's monthly, ${taxBit} tax pot skim. That leaves about ${formatNaira(Math.max(available, 0))} free to play with.`;
}
