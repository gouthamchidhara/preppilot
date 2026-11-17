// Framework-agnostic handlers: (req) -> { status, body, headers }.
// req = { body, headers (lower-case keys), ip }
import { complete, llmConfigured } from './llm.js';
import { rateLimit, validateChat, validateGenerate, validateLiveHint, validateSuggestion, sanitizeGenerated } from './guard.js';
import { chatSystemPrompt, generateSystemPrompt, generateUserPrompt } from './prompts.js';
import { realtimeConfigured, validateRealtime, startRealtime, hangupCall } from './realtime.js';
import { identify, verifyIdToken, signSession } from './auth.js';
import { upsertUser, status, consumeMsgs, refundMsgs, reserveVoice, refundVoice, recordCall, endCall, sweepCalls, deleteUser, startLiveSession, cancelLiveSession, loadUser } from './account.js';
import { COST, limits, proPriceLabel, livePriceLabel, planOf } from './plans.js';
import { webhookAuthorized, applyWebhook, refreshFromRevenueCat } from './billing.js';
import { getDb } from './db.js';
import { createHash, randomUUID } from 'node:crypto';
import { sendSuggestionEmail } from './email.js';

const json = (status, body, headers = {}) => ({ status, body, headers });
const denied = r => json(r.status, { error: r.message, code: r.code });
const today = now => new Date(now).toISOString().slice(0, 10);

function fail(err, log) {
  log?.(`error: ${err.message} ${err.detail || ''}`);
  if (err.status === 429) return json(429, { error: err.message });
  if (err.status === 503) return json(503, { error: err.message });
  return json(502, { error: 'The AI service had a problem. Try again.' });
}

function who(req) {
  const ident = identify(req.headers);
  if (!ident) return { error: json(401, { error: 'Sign in to use the AI coach.', code: 'signin' }) };
  return { ident };
}

function limited(kind, ident) {
  const rl = rateLimit(kind, ident.key);
  return rl.ok ? null : json(429, { error: rl.reason }, { 'retry-after': String(rl.retryAfter) });
}

/* ---------- auth ---------- */
export async function handleAuth(provider, req, log) {
  const token = req.body?.idToken;
  if (typeof token !== 'string' || token.length > 5000) return json(400, { error: 'idToken required' });
  try {
    const ident = await verifyIdToken(provider, token);
    if (req.body?.name && provider === 'apple') ident.name = String(req.body.name).slice(0, 80);
    await upsertUser(ident);
    return json(200, { token: signSession(ident), account: await status(ident) });
  } catch (e) {
    log?.(`auth ${provider}: ${e.message}`);
    return json(e.status === 503 ? 503 : 401, { error: e.status === 503 ? e.message : 'Sign-in failed. Try again.' });
  }
}

export async function handleMe(req) {
  const w = who(req);
  if (w.error) return w.error;
  const s = await status(w.ident);
  return s ? json(200, s) : json(401, { error: 'Account not found. Sign in again.', code: 'signin' });
}

/* ---------- AI ---------- */
export async function handleChat(req, log) {
  const v = validateChat(req.body);
  if (v.error) return json(400, { error: v.error });
  const w = who(req);
  if (w.error) return w.error;
  const rl = limited('chat', w.ident);
  if (rl) return rl;
  const q = await consumeMsgs(w.ident, COST.chat);
  if (!q.ok) return denied(q);
  try {
    const reply = await complete([{ role: 'system', content: chatSystemPrompt(v) }, ...v.messages], { maxTokens: v.voice ? 200 : 500 });
    return json(200, { reply, account: await status(w.ident) });
  } catch (e) {
    await refundMsgs(w.ident, COST.chat, q.plan);
    return fail(e, log);
  }
}

export async function handleGenerate(req, log) {
  const v = validateGenerate(req.body);
  if (v.error) return json(400, { error: v.error });
  const w = who(req);
  if (w.error) return w.error;
  const rl = limited('generate', w.ident);
  if (rl) return rl;
  const q = await consumeMsgs(w.ident, COST.generate);
  if (!q.ok) return denied(q);
  try {
    const raw = await complete(
      [{ role: 'system', content: generateSystemPrompt() }, { role: 'user', content: generateUserPrompt(v) }],
      { json: true, maxTokens: 3500, temperature: 0.3 },
    );
    const pack = sanitizeGenerated(raw);
    if (!pack) { await refundMsgs(w.ident, COST.generate, q.plan); return json(502, { error: 'The AI returned unusable content. Try again or rephrase the topic.' }); }
    return json(200, { topic: v.topic, ...pack, account: await status(w.ident) });
  } catch (e) {
    await refundMsgs(w.ident, COST.generate, q.plan);
    return fail(e, log);
  }
}

/* ---------- voice ---------- */
export async function handleRealtime(req, log) {
  if (!realtimeConfigured()) return json(503, { error: 'Voice mode is not configured on the server.' });
  const v = validateRealtime(req.body);
  if (v.error) return json(400, { error: v.error });
  const w = who(req);
  if (w.error) return w.error;
  const rl = limited('voice', w.ident);
  if (rl) return rl;
  sweepCalls(hangupCall).catch(() => {});
  const now = Date.now();
  const L = limits();

  // Live coach: one credit buys a 60-minute window. Beta-code sessions have no account, so no credits.
  if (v.mode === 'live') {
    const m = w.ident.viaCode ? { ok: true, allowedSec: L.liveCallSec, resumed: true } : await startLiveSession(w.ident.key, now);
    if (!m.ok) return json(402, { error: 'No Live coach session on this account yet. Buy a session to start.', code: 'no_credit' });
    // The user can pick a shorter session; the window stays open for rejoining either way.
    const allowedSec = v.live?.lengthMin ? Math.min(m.allowedSec, v.live.lengthMin * 60) : m.allowedSec;
    try {
      const out = await startRealtime(v, log);
      if (out.callId) await recordCall({ id: out.callId, key: w.ident.key, start: Date.now(), allowedSec, plan: 'live', day: today(now) });
      return json(200, { sdp: out.sdp, callId: out.callId, allowedSec, degraded: out.degraded, live: true, resumed: m.resumed, account: await status(w.ident) });
    } catch (e) {
      if (!m.resumed) await cancelLiveSession(w.ident.key);
      return fail(e, log);
    }
  }

  const r = await reserveVoice(w.ident, now);
  if (!r.ok) return denied(r);
  try {
    const out = await startRealtime(v, log);
    if (out.callId) {
      await recordCall({ id: out.callId, key: w.ident.key, start: Date.now(), allowedSec: r.allowedSec, plan: r.plan, day: today(now) });
    } else if (r.plan !== 'admin') {
      log?.('realtime: no call id returned; time cannot be enforced server-side for this call');
    }
    return json(200, { sdp: out.sdp, callId: out.callId, allowedSec: r.allowedSec, degraded: out.degraded });
  } catch (e) {
    await refundVoice(w.ident.key, r.allowedSec, r.plan, today(now), now);
    return fail(e, log);
  }
}

export async function handleRealtimeEnd(req) {
  const w = who(req);
  if (w.error) return w.error;
  const id = req.body?.callId;
  if (typeof id !== 'string' || !/^[\w-]{3,128}$/.test(id)) return json(400, { error: 'callId required' });
  const ended = await endCall(id, { key: w.ident.key, hangup: hangupCall });
  return json(200, { ended: !!ended, usedSec: ended?.usedSec ?? null, account: await status(w.ident) });
}

// Live coach hint: a short hint for the question the coach just asked, plus what a strong
// answer would add. Practice only: hints are served only while a Live coach window is open
// (or to an admin), and are part of the paid session, so they do not consume chat quota.
export async function handleLiveHint(req, log) {
  const v = validateLiveHint(req.body);
  if (v.error) return json(400, { error: v.error });
  const w = who(req);
  if (w.error) return w.error;
  const rl = limited('liveHint', w.ident);
  if (rl) return rl;
  const user = await loadUser(w.ident);
  const now = Date.now();
  const inWindow = user && (planOf(user, now) === 'admin' || (user.mockUntil || 0) > now);
  if (!inWindow) return json(402, { error: 'Hints are part of a Live coach session. Start one to get hints.', code: 'no_live_session' });
  const system = 'You are PrepPilot\'s practice helper. The user is in a timed practice test. '
    + 'Given the coach\'s question and the user\'s answer so far (if any), reply with ONLY a JSON object: '
    + '{"hint": "one short hint for answering, 1-2 sentences", "strong": "2-3 things a strong answer would add, concise"}. No markdown.';
  const userText = v.answer
    ? `Question: ${v.question}\nAnswer so far: ${v.answer}`
    : `Question: ${v.question}\nNo answer yet.`;
  try {
    const raw = await complete([{ role: 'system', content: system }, { role: 'user', content: userText }], { json: true, maxTokens: 300, temperature: 0.3 });
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* fall through to the raw-text fallback */ }
    const hint = typeof parsed?.hint === 'string' && parsed.hint.trim() ? parsed.hint.trim().slice(0, 600) : String(raw).slice(0, 600);
    const strong = typeof parsed?.strong === 'string' ? parsed.strong.trim().slice(0, 600) : '';
    return json(200, { hint, strong });
  } catch (e) {
    return fail(e, log);
  }
}

/* ---------- guide suggestions ---------- */
// Signed-in users can ask for extra guides/topics. Stored in Table Storage and,
// when ACS Email is configured, emailed to the address in SUGGESTIONS_EMAIL.
// Email is best-effort: a failed or unconfigured send still stores the suggestion
// and answers 200 with emailed: false, so the user never loses their request.
export async function handleSuggestion(req, log) {
  const v = validateSuggestion(req.body);
  if (v.error) return json(400, { error: v.error });
  const w = who(req);
  if (w.error) return w.error;
  const rl = limited('suggestions', w.ident);
  if (rl) return rl;
  const user = await loadUser(w.ident);
  const email = user?.email || w.ident.email || '';
  const createdAt = new Date().toISOString();
  await (await getDb()).update('suggestions', randomUUID(), () => ({
    text: v.text, topic: v.topic, userId: w.ident.key, userEmail: email, createdAt,
  }));
  let emailed = false;
  try {
    const r = await sendSuggestionEmail({ text: v.text, topic: v.topic, userEmail: email, createdAt });
    emailed = r.sent;
    if (!r.sent) log?.(`suggestion email skipped: ${r.reason}`);
  } catch (e) {
    log?.(`suggestion email failed: ${e.message}`);
  }
  return json(200, { stored: true, emailed });
}

export async function handleDeleteAccount(req) {
  const w = who(req);
  if (w.error) return w.error;
  if (w.ident.viaCode) return json(400, { error: 'Beta-code sessions have no account to delete.' });
  await deleteUser(w.ident.key);
  return json(200, { deleted: true });
}

export async function handleSweep() {
  return json(200, { hungUp: await sweepCalls(hangupCall) });
}

/* ---------- billing ---------- */
export async function handleRevenueCatWebhook(req, log) {
  if (!webhookAuthorized(req.headers.authorization)) return json(401, { error: 'unauthorized' });
  try { return json(200, await applyWebhook(req.body)); } catch (e) { log?.(`webhook: ${e.message}`); return json(500, { error: 'webhook failed' }); }
}

export async function handleBillingRefresh(req, log) {
  const w = who(req);
  if (w.error) return w.error;
  try {
    const r = await refreshFromRevenueCat(w.ident.key);
    return json(200, { ...r, account: await status(w.ident) });
  } catch (e) { return fail(e, log); }
}

/* ---------- telemetry ---------- */
// Anonymous count of roles users typed under "Other / not listed". No account, IP or free text beyond the role.
export async function handleRoleTelemetry(req) {
  const role = String(req.body?.role || '').replace(/<[^>]*>/g, ' ').toLowerCase().replace(/[^a-z0-9 +#./-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (role.length < 2) return json(400, { error: 'role required' });
  const client = req.headers['x-client-id'];
  const key = typeof client === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(client) ? client : 'anon';
  if (!rateLimit('telemetry', key).ok) return json(429, { error: 'Too many requests.' });
  const rowKey = createHash('sha1').update(role).digest('hex').slice(0, 20);
  await (await getDb()).update('roles', rowKey, r => ({ role, count: (r?.count || 0) + 1, last: new Date().toISOString().slice(0, 10) }));
  return json(200, { ok: true });
}

export function handleHealth() {
  const L = limits();
  return json(200, {
    ok: true,
    ai: llmConfigured() ? 'azure-openai' : 'mock',
    voice: realtimeConfigured(),
    googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
    payments: !!process.env.REVENUECAT_WEBHOOK_AUTH,
    plans: {
      free: { msgs: L.free.msgs, voiceMin: Math.floor(L.free.voiceSec / 60) },
      pro: { msgs: L.pro.msgs, voiceMin: Math.floor(L.pro.voiceSec / 60), price: proPriceLabel() },
      live: { minutes: Math.floor(L.liveCallSec / 60), price: livePriceLabel() },
    },
  });
}
