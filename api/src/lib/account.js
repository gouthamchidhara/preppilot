// Quota accounting. Messages are charged before the AI call (refunded on failure).
// Voice seconds are reserved when a call starts and the unused part refunded when it ends;
// calls that never report an end are hung up by the sweeper once their reservation runs out.
import { getDb } from './db.js';
import { limits, planOf, rollPeriod, usageStatus } from './plans.js';

const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const err = (status, code, message) => ({ ok: false, status, code, message });

export async function upsertUser(ident, now = Date.now()) {
  const db = await getDb();
  return db.update('users', ident.key, u => {
    const user = u || { key: ident.key, provider: ident.provider, createdAt: now, free: { msgs: 0, voiceSec: 0 }, pro: { periodStart: now, msgs: 0, voiceSec: 0 } };
    if (ident.email) user.email = ident.email;
    if (ident.name && !user.name) user.name = ident.name;
    user.lastLogin = now;
    return user;
  });
}

export async function loadUser(ident) {
  if (ident?.viaCode) return { key: ident.key, admin: true };
  if (!ident) return null;
  return (await getDb()).get('users', ident.key);
}

export async function status(ident, now = Date.now()) {
  const user = await loadUser(ident);
  if (!user) return null;
  return { key: user.key, email: user.email || '', name: user.name || '', ...usageStatus(user, now) };
}

async function pool(field, delta, now) {
  const db = await getDb();
  const cap = limits().freePoolPerDay[field];
  let ok = true;
  await db.update('daily', day(now), d => {
    const cur = d || { msgs: 0, voiceSec: 0 };
    if (delta > 0 && cur[field] + delta > cap) { ok = false; return undefined; }
    cur[field] = Math.max(0, cur[field] + delta);
    return cur;
  });
  return ok;
}

async function poolLeft(field, now) {
  const d = await (await getDb()).get('daily', day(now));
  return Math.max(0, limits().freePoolPerDay[field] - (d?.[field] || 0));
}

const FREE_POOL_MSG = 'Free AI is at capacity for today. Upgrade to Pro or try again tomorrow.';
const QUOTA_MSG = { free: 'You\'ve used your free AI allowance. Upgrade to Pro ($4.99/month) to keep going.', pro: 'You\'ve used this month\'s Pro allowance. It resets at the start of your next billing period.' };

export async function consumeMsgs(ident, n, now = Date.now()) {
  const user = await loadUser(ident);
  if (!user) return err(401, 'signin', 'Sign in to use the AI coach.');
  const plan = planOf(user, now);
  if (plan === 'admin') return { ok: true, plan };
  if (plan === 'free' && !(await pool('msgs', n, now))) return err(429, 'free_pool', FREE_POOL_MSG);
  let result = null;
  await (await getDb()).update('users', user.key, u => {
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    if (bucket.msgs + n > limits()[plan].msgs) { result = err(402, 'quota', QUOTA_MSG[plan]); return undefined; }
    bucket.msgs += n;
    return u;
  });
  if (result) { if (plan === 'free') await pool('msgs', -n, now); return result; }
  return { ok: true, plan };
}

export async function refundMsgs(ident, n, plan, now = Date.now()) {
  if (plan === 'admin' || !ident || ident.viaCode) return;
  await (await getDb()).update('users', ident.key, u => {
    if (!u) return undefined;
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    bucket.msgs = Math.max(0, bucket.msgs - n);
    return u;
  });
  if (plan === 'free') await pool('msgs', -n, now);
}

export async function reserveVoice(ident, now = Date.now()) {
  const user = await loadUser(ident);
  if (!user) return err(401, 'signin', 'Sign in to use voice mode.');
  const L = limits();
  const plan = planOf(user, now);
  if (plan === 'admin') return { ok: true, plan, allowedSec: L.maxCallSec };
  let allowed = 0;
  let result = null;
  await (await getDb()).update('users', user.key, u => {
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    allowed = Math.min(L[plan].voiceSec - bucket.voiceSec, L.maxCallSec);
    if (allowed < L.minCallSec) { result = err(402, 'quota', plan === 'free' ? 'Your free voice minutes are used up. Upgrade to Pro for 45 voice minutes a month.' : QUOTA_MSG.pro); return undefined; }
    bucket.voiceSec += allowed;
    return u;
  });
  if (result) return result;
  if (plan === 'free') {
    const left = await poolLeft('voiceSec', now);
    const take = Math.min(allowed, left);
    if (take < L.minCallSec || !(await pool('voiceSec', take, now))) {
      await refundVoice(user.key, allowed, plan, null, now);
      return err(429, 'free_pool', FREE_POOL_MSG);
    }
    if (take < allowed) { await refundVoice(user.key, allowed - take, plan, null, now); allowed = take; }
  }
  return { ok: true, plan, allowedSec: allowed };
}

export async function refundVoice(key, sec, plan, poolDay, now = Date.now()) {
  if (plan === 'admin' || sec <= 0 || key === 'code:admin') return;
  await (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    bucket.voiceSec = Math.max(0, bucket.voiceSec - sec);
    return u;
  });
  if (plan === 'free' && poolDay) {
    await (await getDb()).update('daily', poolDay, d => (d ? { ...d, voiceSec: Math.max(0, d.voiceSec - sec) } : undefined));
  }
}

export async function recordCall(call) {
  await (await getDb()).update('calls', call.id, () => ({ ...call, status: 'active' }));
}

// Ends a call once; returns the call only to the first caller so refunds can't happen twice.
export async function endCall(id, { key, now = Date.now(), hangup } = {}) {
  let ended = null;
  await (await getDb()).update('calls', id, c => {
    if (!c || c.status !== 'active' || (key && c.key !== key)) return undefined;
    ended = { ...c, status: 'ended', endedAt: now };
    return ended;
  });
  if (!ended) return null;
  try { await hangup?.(id); } catch { /* call may already be over */ }
  const usedSec = Math.min(ended.allowedSec, Math.ceil((now - ended.start) / 1000));
  await refundVoice(ended.key, ended.allowedSec - usedSec, ended.plan, ended.day, now);
  return { ...ended, usedSec };
}

// Hang up calls whose reserved time is over (grace 15s). Run on a timer and opportunistically.
export async function sweepCalls(hangup, now = Date.now()) {
  const db = await getDb();
  const overdue = await db.list('calls', c => c.status === 'active' && c.start + c.allowedSec * 1000 + 15000 < now);
  for (const c of overdue) {
    await db.update('calls', c.id, x => (x && x.status === 'active' ? { ...x, status: 'expired', endedAt: now } : undefined));
    try { await hangup(c.id); } catch { /* already gone */ }
  }
  return overdue.length;
}

export async function setProUntil(key, untilMs, now = Date.now()) {
  return (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    const wasPro = u.proUntil && u.proUntil > now;
    u.proUntil = untilMs;
    if (!wasPro && untilMs > now) u.pro = { periodStart: now, msgs: 0, voiceSec: 0 };
    return u;
  });
}
