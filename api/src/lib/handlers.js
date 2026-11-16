// Framework-agnostic handlers: (req) -> { status, body, headers }.
// req = { body, headers (lower-case keys), ip }
import { complete, llmConfigured } from './llm.js';
import { rateLimit, checkAccessCode, validateChat, validateGenerate, sanitizeGenerated } from './guard.js';
import { chatSystemPrompt, generateSystemPrompt, generateUserPrompt } from './prompts.js';
import { realtimeConfigured, validateRealtime, startRealtime } from './realtime.js';

const json = (status, body, headers = {}) => ({ status, body, headers });

function clientKey(req) {
  const id = req.headers['x-client-id'];
  if (typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id)) return id;
  return (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
}

function gate(kind, req) {
  if (!checkAccessCode(req.headers['x-access-code'])) return json(401, { error: 'Access code required or incorrect.' });
  const rl = rateLimit(kind, clientKey(req));
  if (!rl.ok) return json(429, { error: rl.reason }, { 'retry-after': String(rl.retryAfter) });
  return null;
}

function fail(err, log) {
  log?.(`AI error: ${err.message} ${err.detail || ''}`);
  return json(err.status === 429 ? 429 : 502, { error: err.status === 429 ? err.message : 'The AI service had a problem. Try again.' });
}

export async function handleChat(req, log) {
  const v = validateChat(req.body);
  if (v.error) return json(400, { error: v.error });
  const blocked = gate('chat', req);
  if (blocked) return blocked;
  try {
    const reply = await complete(
      [{ role: 'system', content: chatSystemPrompt(v) }, ...v.messages],
      { maxTokens: v.voice ? 250 : 800 },
    );
    return json(200, { reply });
  } catch (err) { return fail(err, log); }
}

export async function handleGenerate(req, log) {
  const v = validateGenerate(req.body);
  if (v.error) return json(400, { error: v.error });
  const blocked = gate('generate', req);
  if (blocked) return blocked;
  try {
    const raw = await complete(
      [{ role: 'system', content: generateSystemPrompt() }, { role: 'user', content: generateUserPrompt(v) }],
      { json: true, maxTokens: 3500, temperature: 0.3 },
    );
    const pack = sanitizeGenerated(raw);
    if (!pack) return json(502, { error: 'The AI returned unusable content. Try again or rephrase the topic.' });
    return json(200, { topic: v.topic, ...pack });
  } catch (err) { return fail(err, log); }
}

export async function handleRealtime(req, log) {
  if (!realtimeConfigured()) return json(503, { error: 'Voice mode is not configured on the server.' });
  const v = validateRealtime(req.body);
  if (v.error) return json(400, { error: v.error });
  const blocked = gate('voice', req);
  if (blocked) return blocked;
  try {
    return json(200, await startRealtime(v, log));
  } catch (err) { return fail(err, log); }
}

export function handleHealth() {
  return json(200, { ok: true, ai: llmConfigured() ? 'azure-openai' : 'mock', voice: realtimeConfigured(), accessCode: !!process.env.ACCESS_CODE });
}
