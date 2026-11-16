// Plans and limits. Numbers are env-tunable; defaults are sized from Azure list prices (Nov 2026):
//   text chat (gpt-4.1-mini)      ~ $0.0013 per message (1.5K in / 400 out tokens)
//   voice (gpt-realtime-mini)     ~ $0.02-0.04 per conversation minute (+ ~$0.003/min transcription)
// Free:  15 messages + 2 voice minutes, lifetime            -> worst case ~ $0.10 per free user
//        global free pool per day: 200 msgs + 10 voice min  -> worst case ~ $0.65/day across ALL free users
// Pro:   $11.99/month (≈ $10.19 after Apple's 15%), 500 msgs + 30 voice min -> worst case ~ $1.85/month
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);

export function limits() {
  return {
    free: { msgs: num('FREE_MSGS', 15), voiceSec: num('FREE_VOICE_SEC', 120), period: 'lifetime' },
    pro: { msgs: num('PRO_MSGS', 500), voiceSec: num('PRO_VOICE_SEC', 30 * 60), period: 'month' },
    freePoolPerDay: { msgs: num('FREE_DAILY_MSGS', 200), voiceSec: num('FREE_DAILY_VOICE_SEC', 600) },
    maxCallSec: num('MAX_CALL_SEC', 15 * 60),
    minCallSec: 20,
  };
}

export const COST = { chat: 1, generate: 5 };
const MONTH = 30 * 86400000;

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function planOf(user, now = Date.now()) {
  if (!user) return 'anon';
  if (user.admin || (user.email && adminEmails().includes(user.email.toLowerCase()))) return 'admin';
  if (user.proUntil && user.proUntil > now) return 'pro';
  return 'free';
}

// Start a new monthly pro period when the old one is over. Mutates and returns user.
export function rollPeriod(user, now = Date.now()) {
  user.free ||= { msgs: 0, voiceSec: 0 };
  user.pro ||= { periodStart: now, msgs: 0, voiceSec: 0 };
  if (now - user.pro.periodStart >= MONTH) user.pro = { periodStart: now, msgs: 0, voiceSec: 0 };
  return user;
}

export function usageStatus(user, now = Date.now()) {
  const plan = planOf(user, now);
  const L = limits();
  if (plan === 'admin') return { plan, unlimited: true };
  if (plan === 'anon') return { plan, msgsLeft: 0, voiceSecLeft: 0 };
  rollPeriod(user, now);
  const bucket = plan === 'pro' ? user.pro : user.free;
  const lim = L[plan];
  return {
    plan,
    msgsLeft: Math.max(0, lim.msgs - bucket.msgs),
    voiceSecLeft: Math.max(0, lim.voiceSec - bucket.voiceSec),
    limits: { msgs: lim.msgs, voiceSec: lim.voiceSec, period: lim.period },
    proUntil: plan === 'pro' ? user.proUntil : undefined,
    periodEnds: plan === 'pro' ? user.pro.periodStart + MONTH : undefined,
  };
}
