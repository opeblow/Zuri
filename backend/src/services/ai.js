import { z } from 'zod';
import { buildMemorySnapshot, formatNaira, formatSpokenNaira } from './memory.js';
import { logger } from '../lib/logger.js';

/**
 * Converts reply_text (with ₦ symbols and digits) into TTS-friendly spoken text.
 * Replaces currency amounts with spoken words so the voice synthesizer reads them correctly.
 */
function toSpoken(replyText) {
  return replyText
    .replace(/₦[\d,]+/g, (match) => {
      const num = parseInt(match.replace(/[₦,]/g, ''), 10);
      return isNaN(num) ? match : formatSpokenNaira(num * 100);
    })
    .replace(/[\d,]+/g, (match) => {
      const num = parseInt(match.replace(/,/g, ''), 10);
      return isNaN(num) ? match : num.toString();
    });
}

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
    'deposit_goal',
    'withdraw_goal',
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
  spoken_text: z.string(),
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
Your personality is Gen Z, short, and concise. Don't be verbose. Be punchy.

Rules:
1) Always confirm before executing money movement.
2) Never invent account numbers — only use beneficiaries from memory.
3) Ground advice in the memory numbers; do not guess.
4) Reply in the same language the user used (en/yo/pcm).
5) NEVER mention "kobo" in your spoken_text. Always convert kobo amounts to Naira (e.g. divide by 100).
6) IMPORTANT: Users speak in Naira (e.g. "5k" = 5000 Naira). You MUST convert this to kobo (multiply by 100) for the amount_kobo field (e.g., 5000 Naira = 500000 kobo).
7) The reply_text should contain formatted digits and symbols (e.g. ₦5,000). The spoken_text MUST phonetically spell out ALL numbers and currencies as words (e.g. "five thousand Naira") so the voice synthesizer reads it flawlessly.
8) Use "create_goal", "deposit_goal", or "withdraw_goal" to manage goals. ALWAYS include the 'amount_kobo' if they mention an amount to deposit/withdraw/save.
9) Reply in the language the user used (en/yo/pcm). If the user's language is ambiguous or English, respond using their profile default language: {{DEFAULT_LANG}}.
10) Return structured JSON exactly matching this schema:
{
  "action": "none" | "check_balance" | "spending_insight" | "advice" | "transfer" | "bulk_transfer" | "create_goal" | "deposit_goal" | "withdraw_goal" | "setup_direct_debit" | "ask_clarify" | "cannot_help",
  "amount_kobo": number | null,
  "recipient_ref": string | null,
  "goal_ref": string | null,
  "language": "en" | "yo" | "pcm" | "ig" | "ha",
  "confidence": number (0 to 1),
  "reply_text": string,
  "spoken_text": string,
  "requires_confirmation": boolean,
  "pending_action": { "type": string, "payload": object } | null
}
`;

function detectLanguage(text, defaultLang = 'en') {
  const t = text.toLowerCase();
  if (/[ṣẹọáíúàèìòùń]|ṣé|mo ní|owó|báyìí|rá|tuntun|jẹ́/.test(t) || /ṣe |naira|owo/.test(t)) {
    if (/ṣé|owó|báyìí|tuntun|mo ní|rà/.test(t)) return 'yo';
  }
  if (/\b(abeg|wetin|how far|na|una|dey|fit|sabi|chop)\b/i.test(text)) return 'pcm';
  return defaultLang;
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
  const bene = memory.beneficiaries.find(
    (b) =>
      b.id === ref ||
      b.nickname.toLowerCase() === needle ||
      b.full_name.toLowerCase().includes(needle) ||
      needle.includes(b.nickname.toLowerCase()),
  );
  if (bene) return bene;
  // Fuzzier matching: just check if needle is in nickname or vice-versa
  return memory.beneficiaries.find(
    (b) => needle.includes(b.nickname.toLowerCase()) || b.nickname.toLowerCase().includes(needle)
  );
}

/**
 * Demo reasoning engine — handles the three killer moments + core intents
 * without requiring Anthropic/OpenAI keys. Same DecisionSchema as live LLM.
 */
function demoReason(transcript, memory, history = [], defaultLang = 'en') {
  const text = transcript.trim();
  const language = detectLanguage(text, defaultLang);
  const lower = text.toLowerCase();
  const regexAmount = parseAmountRegex(text);

  // Moment 3 — Yoruba phone affordability
  if (
    language === 'yo' ||
    /phone tuntun|owó tí mo lè|ṣé mo ní|ra phone|buy.*(phone|iphone)/i.test(text)
  ) {
    const rent = memory.goals.find((g) => /rent/i.test(g.name));
    const balance = memory.user.current_balance_kobo;
    const monthlyRent = rent?.recurring_amount_kobo ?? 9_000_000;
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
      spoken_text: toSpoken(reply_text),
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
      spoken_text: toSpoken(reply_text),
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
      const notFoundText =
        language === 'pcm'
          ? `I no get ${recipient_ref || 'that person'} for your beneficiary list. Make we enter their bank details.`
          : `I don't have ${recipient_ref || 'that person'} in your beneficiaries yet. Let's enter their bank details.`;
      return DecisionSchema.parse({
        action: 'transfer',
        language,
        confidence: 0.85,
        reply_text: notFoundText,
        spoken_text: toSpoken(notFoundText),
        requires_confirmation: true,
        pending_action: {
          type: 'prompt_beneficiary_details',
          payload: {
            recipient_ref: recipient_ref || 'Unknown',
            amount_kobo: amount_kobo || 0,
          },
        },
      });
    }

    if (!amount_kobo) {
      const howMuchText = `How much should I send to ${bene.nickname}?`;
      return DecisionSchema.parse({
        action: 'ask_clarify',
        language,
        confidence: 0.75,
        reply_text: howMuchText,
        spoken_text: howMuchText,
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
      spoken_text: toSpoken(reply_text),
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
    const balText =
      language === 'yo'
        ? `Owó tó wà lórí account rẹ jẹ́ ${formatNaira(memory.user.current_balance_kobo)}.`
        : language === 'pcm'
          ? `Your balance na ${formatNaira(memory.user.current_balance_kobo)}.`
          : `Your available balance is ${formatNaira(memory.user.current_balance_kobo)}.`;
    return DecisionSchema.parse({
      action: 'check_balance',
      language,
      confidence: 0.98,
      reply_text: balText,
      spoken_text: toSpoken(balText),
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
      spoken_text: toSpoken(reply_text),
      requires_confirmation: false,
    });
  }

  const fallbackText = "I can check your balance, explain spending, plan goals like rent, or send money to people you've saved. What do you want to do?";
  return DecisionSchema.parse({
    action: 'ask_clarify',
    language,
    confidence: 0.55,
    reply_text: fallbackText,
    spoken_text: fallbackText,
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

async function callGroq(transcript, fullSystem) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: fullSystem },
          {
            role: 'user',
            content: `User said: """${transcript}""". Return DecisionSchema JSON matching fields: action, amount_kobo, recipient_ref, goal_ref, language, confidence, reply_text, spoken_text, requires_confirmation, pending_action.`,
          },
        ],
        max_tokens: 512,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn({ status: res.status, error: errText, provider: 'groq' }, 'Groq API request failed — falling back');
      return null;
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const json = JSON.parse(cleaned);

    if (!json.spoken_text && json.reply_text) {
      json.spoken_text = toSpoken(json.reply_text);
    }
    if (json.confidence === undefined || json.confidence === null) {
      json.confidence = 0.9;
    }

    return DecisionSchema.parse(json);
  } catch (err) {
    logger.error({ err: err.message, provider: 'groq' }, 'Groq response processing error');
    return null;
  }
}

async function callAnthropic(transcript, fullSystem) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: fullSystem,
      messages: [
        {
          role: 'user',
          content: `User said: """${transcript}"""\nRespond with JSON only matching DecisionSchema fields: action, amount_kobo, recipient_ref, goal_ref, language, confidence, reply_text, spoken_text, requires_confirmation, pending_action.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    logger.warn({ status: res.status, provider: 'anthropic' }, 'Anthropic failed — falling back');
    return null;
  }

  const data = await res.json();
  const text = data.content?.map((c) => c.text).join('') || '';
  const json = JSON.parse(text.replace(/```json|```/g, '').trim());
  return DecisionSchema.parse(json);
}

async function callGithub(transcript, fullSystem) {
  const apiKey = process.env.GITHUB_AI_API_KEY;
  if (!apiKey) return null;

  const ghModel = process.env.GITHUB_AI_MODEL || 'gpt-4o-mini';
  const ghBase = process.env.GITHUB_AI_BASE_URL || 'https://models.inference.ai.azure.com';
  const res = await fetch(`${ghBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ghModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: fullSystem },
        {
          role: 'user',
          content: `User said: """${transcript}""". Return DecisionSchema JSON.`,
        },
      ],
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    logger.warn({ status: res.status, provider: 'github-models' }, 'GitHub Models failed — falling back');
    return null;
  }

  const data = await res.json();
  return DecisionSchema.parse(JSON.parse(data.choices[0].message.content));
}

async function callOpenAI(transcript, fullSystem) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: fullSystem },
        {
          role: 'user',
          content: `User said: """${transcript}""". Return DecisionSchema JSON.`,
        },
      ],
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    logger.warn({ status: res.status, provider: 'openai' }, 'OpenAI failed — falling back');
    return null;
  }

  const data = await res.json();
  return DecisionSchema.parse(JSON.parse(data.choices[0].message.content));
}

async function liveLlmReason(transcript, memory, history = [], defaultLang = 'en') {
  const historyText = history.length
    ? `\n\nRecent Conversation History:\n${history.map((m) => `${m.role === 'user' ? 'User' : 'Zuri'}: ${m.text}`).join('\n')}`
    : '';
  const rulesWithLang = SYSTEM_RULES.replace('{{DEFAULT_LANG}}', defaultLang);
  const fullSystem = `${rulesWithLang}\n\nMemory:\n${JSON.stringify(memory)}${historyText}`;

  const selectedProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase();

  const providers = {
    groq: callGroq,
    anthropic: callAnthropic,
    github: callGithub,
    openai: callOpenAI,
  };

  // If a specific provider is configured in AI_PROVIDER
  if (selectedProvider !== 'auto' && providers[selectedProvider]) {
    try {
      const decision = await providers[selectedProvider](transcript, fullSystem);
      if (decision) return decision;
    } catch (err) {
      logger.warn({ err: err.message, provider: selectedProvider }, 'Selected AI provider failed — trying fallback order');
    }
  }

  // Automatic fallback order (Groq → GitHub → Anthropic → OpenAI)
  const fallbackOrder = ['groq', 'github', 'anthropic', 'openai'];
  for (const p of fallbackOrder) {
    if (selectedProvider !== 'auto' && p === selectedProvider) continue; // already tried above
    try {
      const decision = await providers[p](transcript, fullSystem);
      if (decision) return decision;
    } catch (err) {
      logger.warn({ err: err.message, provider: p }, `Fallback provider ${p} failed`);
    }
  }

  return null;
}

/**
 * Main Mind entry: transcript + user → validated decision.
 */
export async function reasonOverTranscript(user, transcript, history = []) {
  const memory = buildMemorySnapshot(user);
  const regexAmount = parseAmountRegex(transcript);
  const defaultLang = user.language_pref || 'en';

  let decision = await liveLlmReason(transcript, memory, history, defaultLang);
  if (!decision) decision = demoReason(transcript, memory, history, defaultLang);

  const isTransfer =
    decision.action === 'transfer' ||
    decision.pending_action?.type === 'transfer' ||
    decision.pending_action?.type === 'prompt_beneficiary_details';

  // Enforce strict safety and logic on transfers
  if (isTransfer) {
    decision.action = 'transfer';
    decision.requires_confirmation = true;
    
    let recipient_ref = decision.recipient_ref || decision.pending_action?.payload?.recipient_ref;

    // If LLM missed the recipient but we can guess it from transcript:
    if (!recipient_ref) {
      const nickMatch =
        transcript.match(/(?:to|give|send)\s+([A-Za-zÀ-ÿ]+)/i) ||
        transcript.match(/\b(mummy|mama|ada|landlord)\b/i);
      recipient_ref = nickMatch ? nickMatch[1] : null;
    }
    
    // 1. Resolve beneficiary
    const bene = findBeneficiary(memory, recipient_ref);
    
    // 2. Resolve amount
    const amount = decision.amount_kobo || decision.pending_action?.payload?.amount_kobo || regexAmount;

    if (!recipient_ref) {
      decision = DecisionSchema.parse({
        ...decision,
        action: 'ask_clarify',
        requires_confirmation: false,
        pending_action: null,
        reply_text: `Who do you want to send the money to?`,
        spoken_text: `Who do you want to send the money to?`,
      });
    } else if (!bene) {
      const notFoundReply = `I couldn't find ${recipient_ref} in your beneficiaries. Let's enter their account details.`;
      decision = DecisionSchema.parse({
        ...decision,
        action: 'transfer',
        requires_confirmation: true,
        recipient_ref: recipient_ref,
        amount_kobo: amount,
        pending_action: {
          type: 'prompt_beneficiary_details',
          payload: {
            recipient_ref: recipient_ref,
            amount_kobo: amount || 0,
          }
        },
        reply_text: notFoundReply,
        spoken_text: notFoundReply,
      });
    } else {
      if (!amount) {
        const howMuchReply = `How much do you want to send to ${bene?.nickname || 'them'}?`;
        decision = DecisionSchema.parse({
          ...decision,
          action: 'ask_clarify',
          requires_confirmation: false,
          pending_action: null,
          reply_text: howMuchReply,
          spoken_text: howMuchReply,
        });
      } else if (memory.user.current_balance_kobo < amount) {
        // 3. Balance too low — nudge to top up with their reserved account
        const topUpAcct = memory.user.reserved_account;
        const topUpBank = memory.user.bank_name || 'Moniepoint MFB';
        const shortfall = amount - memory.user.current_balance_kobo;
        const replyText = topUpAcct
          ? `Your balance is low — you have ${formatNaira(memory.user.current_balance_kobo)} but need ${formatNaira(amount)}. Top up at least ${formatNaira(shortfall)} to your account: ${topUpAcct} (${topUpBank}), then try again.`
          : `Your balance is low — you have ${formatNaira(memory.user.current_balance_kobo)} but need ${formatNaira(amount)}. Please top up and try again.`;
        decision = DecisionSchema.parse({
          ...decision,
          action: 'cannot_help',
          requires_confirmation: false,
          pending_action: null,
          reply_text: replyText,
          spoken_text: toSpoken(replyText),
        });
      } else {
        // 4. Double-parse amount conflict
        if (regexAmount && Math.abs(regexAmount - amount) > 100) {
          const conflictReply = `I heard two different amounts. Did you mean ${formatNaira(regexAmount)} or ${formatNaira(amount)}?`;
          decision = DecisionSchema.parse({
            ...decision,
            action: 'ask_clarify',
            requires_confirmation: false,
            pending_action: null,
            reply_text: conflictReply,
            spoken_text: toSpoken(conflictReply),
          });
        } else {
          // 5. Valid transfer - strictly attach pending_action
          const firstSend = bene?.send_count === 0;
          const unusual = amount > (bene?.usual_amount_kobo || 0) * 3;
          
          let reply_text = `I'll send ${formatNaira(amount)} to ${bene.full_name} (${bene.bank_name}). Confirm with your PIN to go ahead.`;
          if (unusual) {
            reply_text = `That's more than 3× what you usually send ${bene.nickname}. Just checking — ${formatNaira(amount)} to ${bene.full_name}. Enter your PIN if that's right.`;
          }
          let finalAmount = amount;
          if (firstSend) {
            finalAmount = Math.min(amount, 2_000_000);
            reply_text = `First time sending to ${bene.full_name}. Cap on first sends is ₦20,000. Confirm with PIN to send ${formatNaira(finalAmount)}.`;
          }
          
          decision = DecisionSchema.parse({
            ...decision,
            action: 'transfer',
            amount_kobo: finalAmount,
            recipient_ref: bene.nickname,
            requires_confirmation: true,
            reply_text: reply_text,
            spoken_text: toSpoken(reply_text),
            pending_action: {
              type: 'transfer',
              payload: {
                beneficiary_id: bene.id,
                amount_kobo: finalAmount,
                unusual: amount > bene.usual_amount_kobo * 3,
              },
            },
          });
        }
      }
    }
  }

  // Intercept goal operations to prevent premature PIN UI or execute properly
  if (['create_goal', 'deposit_goal', 'withdraw_goal'].includes(decision.action)) {
    let amount = decision.amount_kobo || decision.pending_action?.payload?.amount_kobo || regexAmount;
    
    if (!amount && decision.action !== 'withdraw_goal') {
      decision = DecisionSchema.parse({
        ...decision,
        action: 'ask_clarify',
        requires_confirmation: false,
        pending_action: null,
        reply_text: `How much do you want to target for this goal?`,
        spoken_text: `How much do you want to target for this goal?`,
      });
    } else {
      let goalId = null;
      let goalName = decision.goal_ref || 'Savings Goal';
      if (decision.action !== 'create_goal') {
        const existing = memory.goals.find(g => g.name.toLowerCase().includes(goalName.toLowerCase()));
        if (existing) {
          goalId = existing.id;
          goalName = existing.name;
        } else if (memory.goals.length === 1) {
          goalId = memory.goals[0].id;
          goalName = memory.goals[0].name;
        } else if (!existing) {
          const text = `I couldn't find a goal named ${goalName}. Which goal did you mean?`;
          decision = DecisionSchema.parse({
            ...decision,
            action: 'ask_clarify',
            requires_confirmation: false,
            pending_action: null,
            reply_text: text,
            spoken_text: text,
          });
          amount = null; // skip the next block
        }
      }

      if (amount || decision.action === 'withdraw_goal') {
        decision.requires_confirmation = true;
        let payload = { amount_kobo: amount || 0, goal_id: goalId, goal_name: goalName };
        let type = decision.action; // 'create_goal', 'deposit_goal', 'withdraw_goal'
        let text = decision.reply_text;
        
        if (decision.action === 'create_goal') {
           text = `Let's create the ${goalName} goal for ${formatNaira(amount)}. Confirm with your PIN.`;
           payload = { name: goalName, target_amount_kobo: amount, target_date: '2026-12-31', recurring_amount_kobo: 0 };
        } else if (decision.action === 'deposit_goal') {
           text = `I'll move ${formatNaira(amount)} into your ${goalName} goal. Confirm with your PIN.`;
        } else if (decision.action === 'withdraw_goal') {
           if (!amount) payload.amount_kobo = 'ALL'; // withdraw all flag
           text = payload.amount_kobo === 'ALL' 
             ? `I'll withdraw everything from your ${goalName} goal back to your balance. Confirm with PIN.`
             : `I'll withdraw ${formatNaira(amount)} from your ${goalName} goal back to your balance. Confirm with PIN.`;
        }

        decision.reply_text = text;
        decision.spoken_text = toSpoken(text);
        decision.pending_action = { type, payload };
      }
    }
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

/** TTS — YarnGPT when keyed; else return null (frontend uses speechSynthesis) */
export async function textToSpeech(text, language = 'en', voice = null) {
  if (!process.env.YARNGPT_API_KEY) {
    return { audioUrl: null, cached: false, fallback: 'browser' };
  }
  const res = await fetch(
    `https://yarngpt.ai/api/v1/tts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.YARNGPT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: voice || process.env.YARNGPT_VOICE || 'Zainab',
        response_format: 'mp3',
      }),
    },
  );
  if (!res.ok) {
    const textErr = await res.text();
    logger.error({ status: res.status, error: textErr }, 'YarnGPT TTS failed');
    return { audioUrl: null, cached: false, fallback: 'browser' };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  return { audioUrl: `data:audio/mpeg;base64,${b64}`, cached: false, fallback: null };
}

/**
 * Builds the proactive "salary landed" spoken moment (Moment 2).
 */
export function buildSalaryLandedMessage(user, amountKobo, memory) {
  const activeGoals = memory.goals.filter((g) => g.status === 'active' && g.recurring_amount_kobo > 0);
  
  let committedKobo = 0;
  const committedTextParts = [];
  const committedSpokenParts = [];
  
  if (activeGoals.length > 0) {
    for (const goal of activeGoals) {
      committedKobo += goal.recurring_amount_kobo;
      committedTextParts.push(`${formatNaira(goal.recurring_amount_kobo)} to your ${goal.name} goal`);
      committedSpokenParts.push(`${formatSpokenNaira(goal.recurring_amount_kobo)} to your ${goal.name} goal`);
    }
  }

  const activeSkims = memory.automations.filter((a) => a.active && a.trigger_type === 'inbound_credit' && a.action_type === 'skim_to_goal');
  for (const auto of activeSkims) {
    const pct = auto.action_config?.percentage || 0;
    if (pct > 0) {
      const skimKobo = Math.round((amountKobo * pct) / 100);
      committedKobo += skimKobo;
      const goal = memory.goals.find(g => g.id === auto.action_config?.goal_id);
      const goalName = goal ? goal.name : 'savings';
      committedTextParts.push(`${formatNaira(skimKobo)} ${goalName} skim (${pct}%)`);
      committedSpokenParts.push(`${formatSpokenNaira(skimKobo)} ${goalName} skim (${pct} percent)`);
    }
  }

  const available = amountKobo - committedKobo;
  
  let text = `Your salary just landed — ${formatNaira(amountKobo)}. `;
  let spoken_text = `Your salary just landed — ${formatSpokenNaira(amountKobo)}. `;
  
  if (committedTextParts.length > 0) {
    text += `Before you do anything, here's what's already committed: ${committedTextParts.join(', ')}. That leaves about ${formatNaira(Math.max(available, 0))} free to play with.`;
    spoken_text += `Before you do anything, here's what's already committed: ${committedSpokenParts.join(', ')}. That leaves about ${formatSpokenNaira(Math.max(available, 0))} free to play with.`;
  } else {
    text += `You don't have any active goals or commitments yet. Why not save some of this for a rainy day?`;
    spoken_text += `You don't have any active goals or commitments yet. Why not save some of this for a rainy day?`;
  }

  return { text, spoken_text };
}

export function buildInboundTransferMessage(user, amountKobo, sourceName, memory) {
  return {
    text: `You just received ${formatNaira(amountKobo)} from ${sourceName}. Your total balance is now ${formatNaira(memory.user.current_balance_kobo)}.`,
    spoken_text: `You just received ${formatSpokenNaira(amountKobo)} from ${sourceName}. Your total balance is now ${formatSpokenNaira(memory.user.current_balance_kobo)}.`
  };
}
