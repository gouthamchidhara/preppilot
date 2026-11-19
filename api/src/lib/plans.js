// Plans and limits. Numbers are env-tunable; defaults are sized from Azure list prices (Nov 2026):
//   text chat (gpt-4.1-mini)      ~ $0.0013 per message (1.5K in / 400 out tokens)
//   voice (gpt-realtime-mini)     ~ $0.02-0.04 per conversation minute (+ ~$0.003/min transcription)
// Free:  15 messages + 2 voice minutes, lifetime            -> worst case ~ $0.10 per free user
//        global free pool per day: 200 msgs + 10 voice min  -> worst case ~ $0.65/day across ALL free users
// Pro:   $6.99/month (≈ $5.94 after Apple's 15%), unlimited msgs (fair use) + 30 Live AI minutes a month (talk time only); no separate voice minutes -> worst case ~ $6/month
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);

export function limits() {
  return {
    free: { msgs: num('FREE_MSGS', 15), voiceSec: num('FREE_VOICE_SEC', 120), period: 'lifetime' },
    // Pro messages are sold as unlimited; these are fair-use ceilings (a month, and a day) that normal use never reaches.
    pro: { msgs: num('PRO_MSGS', 2000), msgsPerDay: num('PRO_MSGS_PER_DAY', 150), voiceSec: num('PRO_VOICE_SEC', 0), period: 'month' },
    freePoolPerDay: { msgs: num('FREE_DAILY_MSGS', 200), voiceSec: num('FREE_DAILY_VOICE_SEC', 600) },
    maxCallSec: num('MAX_CALL_SEC', 10 * 60),
    liveCallSec: num('LIVE_CALL_SEC', 60 * 60),
    adminCallSec: num('ADMIN_CALL_SEC', 4 * 60 * 60), // admins: any voice call up to 4 hours
    // Pro can run Live AI from its monthly voice minutes, up to this long in one go.
    proLiveSec: num('PRO_LIVE_SEC', 30 * 60),
    proLiveSessions: num('PRO_LIVE_SESSIONS', 2), // legacy; Pro now has a minutes bank
    proLiveBankSec: num('PRO_LIVE_BANK_SEC', 30 * 60), // Live AI minutes in each Pro month; only connected time counts
    minCallSec: 20,
  };
}

export const COST = { chat: 1, generate: 5 };
export const proPriceLabel = () => process.env.PRO_PRICE_LABEL || '$6.99/month';
export const livePriceLabel = () => process.env.LIVE_PRICE_LABEL || '$15.99';
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
  // Stored under the original field names (sessionCredits / mockUntil) so credits bought
  // before the rename keep working; the user-facing name is "Live AI".
  const liveSecLeft = Math.max(0, Math.floor(((user.mockUntil || 0) - now) / 1000));
  if (plan === 'admin') return { plan, unlimited: true, sessionCredits: user.sessionCredits || 0, liveSecLeft };
  if (plan === 'anon') return { plan, msgsLeft: 0, voiceSecLeft: 0, sessionCredits: 0 };
  rollPeriod(user, now);
  const bucket = plan === 'pro' ? user.pro : user.free;
  const lim = L[plan];
  return {
    plan,
    msgsLeft: Math.max(0, lim.msgs - bucket.msgs),
    voiceSecLeft: Math.max(0, lim.voiceSec - bucket.voiceSec),
    sessionCredits: user.sessionCredits || 0,
    msgsUnlimited: plan === 'pro',
    // Pro Live AI is a monthly bank: proLiveSecLeft seconds, proLiveLeft whole minutes.
    proLiveSecLeft: plan === 'pro' ? Math.max(0, L.proLiveBankSec - (user.pro?.liveSecUsed || 0)) : 0,
    proLiveLeft: plan === 'pro' ? Math.floor(Math.max(0, L.proLiveBankSec - (user.pro?.liveSecUsed || 0)) / 60) : 0,
    liveSecLeft,
    limits: { msgs: lim.msgs, voiceSec: lim.voiceSec, period: lim.period },
    proUntil: plan === 'pro' ? user.proUntil : undefined,
    periodEnds: plan === 'pro' ? user.pro.periodStart + MONTH : undefined,
  };
}
