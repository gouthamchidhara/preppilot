// Framework-agnostic handlers: (req) -> { status, body, headers }.
// req = { body, headers (lower-case keys), ip }
import { complete, llmConfigured } from './llm.js';
import { rateLimit, validateChat, validateGenerate, sanitizeGenerated } from './guard.js';
import { chatSystemPrompt, generateSystemPrompt, generateUserPrompt } from './prompts.js';
import { realtimeConfigured, validateRealtime, startRealtime, hangupCall } from './realtime.js';
import { identify, verifyIdToken, signSession } from './auth.js';
import { upsertUser, status, consumeMsgs, refundMsgs, reserveVoice, refundVoice, recordCall, endCall, sweepCalls } from './account.js';
import { COST, limits } from './plans.js';
import { webhookAuthorized, applyWebhook, refreshFromRevenueCat } from './billing.js';

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
    const reply = await complete([{ role: 'system', content: chatSystemPrompt(v) }, ...v.messages], { maxTokens: v.voice ? 250 : 800 });
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
  sweepCalls(hangupCall).catch(() => {}); // opportunistic cleanup of overdue calls
  const now = Date.now();
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
      pro: { msgs: L.pro.msgs, voiceMin: Math.floor(L.pro.voiceSec / 60), price: process.env.PRO_PRICE_LABEL || '$4.99/month' },
    },
  });
}
