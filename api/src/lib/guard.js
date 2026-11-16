import { timingSafeEqual } from 'node:crypto';

const LIMITS = {
  chat: { max: Number(process.env.RATE_CHAT_PER_HOUR || 40), windowMs: 3600000 },
  generate: { max: Number(process.env.RATE_GENERATE_PER_HOUR || 6), windowMs: 3600000 },
  voice: { max: Number(process.env.RATE_VOICE_PER_HOUR || 15), windowMs: 3600000 },
};
const DAILY_CAP = Number(process.env.DAILY_AI_CAP || 3000);

// In-memory, per instance. Good enough to stop casual abuse; the hard cost cap is the
// Azure OpenAI deployment's tokens-per-minute quota plus the budget alert.
const buckets = new Map();
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

export function rateLimit(kind, key, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return { ok: false, retryAfter: 3600, reason: 'Daily AI limit reached for the service. Try tomorrow.' };
  const { max, windowMs } = LIMITS[kind];
  const k = `${kind}:${key}`;
  const hits = (buckets.get(k) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(k, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000), reason: `Limit of ${max} ${kind} requests per hour reached.` };
  }
  hits.push(now);
  buckets.set(k, hits);
  dayCount++;
  if (buckets.size > 50000) buckets.clear();
  return { ok: true };
}

export function resetRateLimits() { buckets.clear(); dayCount = 0; }

export function checkAccessCode(provided) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function validateChat(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return { error: 'messages required' };
  const messages = body.messages.slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return { error: 'last message must be from the user' };
  return {
    messages,
    profile: str(body.profileSummary, 1500),
    context: str(body.context, 3000),
    voice: body.mode === 'voice',
  };
}

export function validateGenerate(body) {
  const topic = str(body?.topic, 120).trim();
  if (topic.length < 2) return { error: 'topic required' };
  const count = Math.min(Math.max(parseInt(body?.count, 10) || 8, 3), 12);
  return { topic, profile: str(body?.profileSummary, 1500), count };
}

// Model output is untrusted: keep only well-formed cards with bounded lengths.
export function sanitizeGenerated(raw) {
  let data;
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  const concepts = (Array.isArray(data?.concepts) ? data.concepts : [])
    .filter(c => c && typeof c.t === 'string' && typeof c.what === 'string')
    .slice(0, 12)
    .map(c => ({ t: str(c.t, 120), what: str(c.what, 1200), why: str(c.why, 600), ex: str(c.ex, 2500), tip: str(c.tip, 400) }));
  const qa = (Array.isArray(data?.qa) ? data.qa : [])
    .filter(q => q && typeof q.q === 'string' && typeof q.a === 'string')
    .slice(0, 20)
    .map(q => ({ l: [1, 2, 3].includes(q.l) ? q.l : 2, q: str(q.q, 400), a: str(q.a, 1500) }));
  if (!concepts.length && !qa.length) return null;
  return { concepts, qa };
}
