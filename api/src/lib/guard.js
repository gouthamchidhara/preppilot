// Per-user request rate limits (abuse brake; spend is governed by quotas in account.js).
const LIMITS = {
  chat: { max: Number(process.env.RATE_CHAT_PER_HOUR || 40), windowMs: 3600000 },
  generate: { max: Number(process.env.RATE_GENERATE_PER_HOUR || 6), windowMs: 3600000 },
  voice: { max: Number(process.env.RATE_VOICE_PER_HOUR || 15), windowMs: 3600000 },
  liveHint: { max: Number(process.env.RATE_LIVE_HINT_PER_HOUR || 20), windowMs: 3600000 },
  suggestions: { max: Number(process.env.RATE_SUGGESTIONS_PER_HOUR || 5), windowMs: 3600000 },
  telemetry: { max: 5, windowMs: 3600000 },
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

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function validateChat(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return { error: 'messages required' };
  const messages = body.messages.slice(-12)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return { error: 'last message must be from the user' };
  return {
    messages,
    profile: str(body.profileSummary, 1000),
    context: str(body.context, 1500),
    voice: body.mode === 'voice',
  };
}

export function validateGenerate(body) {
  const topic = str(body?.topic, 120).trim();
  if (topic.length < 2) return { error: 'topic required' };
  const count = Math.min(Math.max(parseInt(body?.count, 10) || 8, 3), 12);
  return { topic, profile: str(body?.profileSummary, 1500), count };
}

// A Live AI hint: the coach's question, plus the user's answer once given.
// Returns the validated pair; the caller decides whether the user may ask for one.
export function validateLiveHint(body) {
  const question = str(body?.question, 600).trim();
  if (question.length < 10) return { error: 'question required' };
  return { question, answer: str(body?.answer, 2000).trim() };
}

export function validateSuggestion(body) {
  const text = str(body?.text, 500).trim();
  if (text.length < 10) return { error: 'Tell us what guide or topic you want (at least 10 characters).' };
  return { text, topic: str(body?.topic, 120).trim() };
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
  const out = { concepts, qa };
  // The optional story diagram: only a simple flow of 2-4 nodes, everything
  // bounded. Anything malformed is dropped — the guide still works without it.
  const dg = sanitizeDiagram(data?.diagram);
  if (dg) out.diagram = dg;
  return out;
}

// A diagram the AI may attach to a generated guide: flow only, 2-4 nodes,
// steps in the same order as the nodes. Returns the cleaned spec or null.
export function sanitizeDiagram(d) {
  if (!d || d.kind !== 'flow') return null;
  const nodes = (Array.isArray(d.nodes) ? d.nodes : [])
    .filter(n => n && typeof n.label === 'string' && n.label.trim())
    .slice(0, 4)
    .map(n => ({ label: str(n.label, 40), sub: str(n.sub, 40) }));
  if (nodes.length < 2) return null;
  const steps = (Array.isArray(d.steps) ? d.steps : [])
    .filter(s => typeof s === 'string' && s.trim())
    .slice(0, 4)
    .map(s => str(s, 120));
  if (steps.length < 2) return null;
  return {
    kind: 'flow',
    title: str(d.title, 60) || 'How it works',
    caption: str(d.caption, 200) || '',
    nodes,
    steps,
  };
}
