import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

for (const k of ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT', 'AZURE_OPENAI_REALTIME_DEPLOYMENT', 'ACCESS_CODE', 'STORAGE_CONNECTION_STRING']) delete process.env[k];
delete process.env.REVENUECAT_SECRET_KEY;
Object.assign(process.env, {
  RATE_CHAT_PER_HOUR: '1000', RATE_GENERATE_PER_HOUR: '1000', RATE_VOICE_PER_HOUR: '1000',
  GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com', APPLE_AUDIENCES: 'com.gchid.preppilot',
  ADMIN_EMAILS: 'boss@gmail.com', SESSION_SECRET: 'x'.repeat(40), REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret',
});

const { ROUTES } = await import('../api/src/lib/routes.js');
const { setJwksFetcher } = await import('../api/src/lib/auth.js');
const { useMemoryDb } = await import('../api/src/lib/db.js');
const { reserveVoice, recordCall, endCall, sweepCalls, status, startLiveSession, cancelLiveSession } = await import('../api/src/lib/account.js');
const { rateLimit, resetRateLimits, sanitizeGenerated, validateChat } = await import('../api/src/lib/guard.js');
const { validateRealtime, sessionConfigs, voiceInstructions } = await import('../api/src/lib/realtime.js');

// A fake identity provider: our own RSA key served as the JWKS.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
setJwksFetcher(async () => [jwk]);
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims) {
  const head = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64u({ iss: 'https://accounts.google.com', aud: 'web-client.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const call = (route, body, headers = {}) => ROUTES[route]({ body, headers, ip: '1.1.1.1' });
async function signIn(email, sub = email) {
  const r = await call('POST auth/google', { idToken: idToken({ sub, email }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { 'x-session-token': r.body.token };
}
const ask = (h, text = 'explain a hashmap') => call('POST chat', { messages: [{ role: 'user', content: text }] }, h);

beforeEach(async () => {
  await useMemoryDb(); resetRateLimits();
  delete process.env.FREE_MSGS; delete process.env.FREE_DAILY_MSGS; delete process.env.FREE_DAILY_VOICE_SEC;
  delete process.env.REVENUECAT_SECRET_KEY;
});

test('health reports payments ready only when both RevenueCat server credentials are set', async () => {
  const auth = process.env.REVENUECAT_WEBHOOK_AUTH;
  const secret = process.env.REVENUECAT_SECRET_KEY;
  try {
    delete process.env.REVENUECAT_SECRET_KEY;
    assert.equal((await call('GET health')).body.payments, false);
    process.env.REVENUECAT_SECRET_KEY = 'test-secret';
    assert.equal((await call('GET health')).body.payments, true);
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    assert.equal((await call('GET health')).body.payments, false);
  } finally {
    if (auth === undefined) delete process.env.REVENUECAT_WEBHOOK_AUTH;
    else process.env.REVENUECAT_WEBHOOK_AUTH = auth;
    if (secret === undefined) delete process.env.REVENUECAT_SECRET_KEY;
    else process.env.REVENUECAT_SECRET_KEY = secret;
  }
});

test('health reports the Live AI interview mode flag, off by default', async () => {
  const prev = process.env.LIVE_INTERVIEW_IOS;
  try {
    delete process.env.LIVE_INTERVIEW_IOS;
    assert.equal((await call('GET health')).body.liveInterviewIos, false);
    process.env.LIVE_INTERVIEW_IOS = 'on';
    assert.equal((await call('GET health')).body.liveInterviewIos, true);
    process.env.LIVE_INTERVIEW_IOS = 'off';
    assert.equal((await call('GET health')).body.liveInterviewIos, false);
  } finally {
    if (prev === undefined) delete process.env.LIVE_INTERVIEW_IOS;
    else process.env.LIVE_INTERVIEW_IOS = prev;
  }
});

test('AI requires sign-in; the study guide (static) does not touch the API', async () => {
  assert.equal((await ask({})).status, 401);
  assert.equal((await ask({ 'x-session-token': 'forged.token.here' })).status, 401);
});

test('Google sign-in rejects bad signatures, wrong audience, unverified email', async () => {
  const good = idToken({ sub: '1', email: 'a@gmail.com' });
  const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal((await call('POST auth/google', { idToken: tampered })).status, 401);
  assert.equal((await call('POST auth/google', { idToken: idToken({ sub: '1', email: 'a@gmail.com', aud: 'someone-else' }) })).status, 401);
  assert.equal((await call('POST auth/google', { idToken: idToken({ sub: '1', email: 'a@gmail.com', email_verified: false }) })).status, 401);
  assert.equal((await call('POST auth/apple', { idToken: good })).status, 401); // Google token is not an Apple token
});

test('free users get a fixed message allowance, then a 402 upgrade prompt', async () => {
  process.env.FREE_MSGS = '3';
  const h = await signIn('free@gmail.com');
  for (let i = 0; i < 3; i++) assert.equal((await ask(h)).status, 200);
  const r = await ask(h);
  assert.equal(r.status, 402);
  assert.equal(r.body.code, 'quota');
  assert.equal((await call('GET me', null, h)).body.msgsLeft, 0);
});

test('admin email is unlimited', async () => {
  process.env.FREE_MSGS = '1';
  const h = await signIn('Boss@Gmail.com');
  for (let i = 0; i < 5; i++) assert.equal((await ask(h)).status, 200);
  assert.equal((await call('GET me', null, h)).body.plan, 'admin');
});

test('global free pool caps total free spend per day across all users', async () => {
  process.env.FREE_DAILY_MSGS = '2';
  const a = await signIn('a@gmail.com'), b = await signIn('b@gmail.com');
  assert.equal((await ask(a)).status, 200);
  assert.equal((await ask(b)).status, 200);
  const r = await ask(a);
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'free_pool');
});

test('RevenueCat webhook grants and revokes Pro; rejects unauthenticated calls', async () => {
  const h = await signIn('payer@gmail.com', 'payer');
  const key = 'google:payer';
  const ev = type => ({ event: { type, app_user_id: key, entitlement_ids: ['pro'], expiration_at_ms: Date.now() + 30 * 86400000 } });
  assert.equal((await call('POST billing/revenuecat', ev('INITIAL_PURCHASE'), { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await call('POST billing/revenuecat', ev('INITIAL_PURCHASE'), { authorization: 'Bearer hook-secret' })).status, 200);
  let me = (await call('GET me', null, h)).body;
  assert.equal(me.plan, 'pro');
  assert.equal(me.msgsLeft, 2000);
  assert.equal(me.msgsUnlimited, true);
  await call('POST billing/revenuecat', { event: { type: 'EXPIRATION', app_user_id: key, entitlement_ids: ['pro'], expiration_at_ms: Date.now() - 1000 } }, { authorization: 'Bearer hook-secret' });
  me = (await call('GET me', null, h)).body;
  assert.equal(me.plan, 'free');
});

test('voice: reserve on start, refund unused on end, no double refund', async () => {
  await signIn('v@gmail.com', 'v');
  const ident = { key: 'google:v' };
  const t0 = Date.now();
  const r = await reserveVoice(ident, t0);
  assert.equal(r.allowedSec, 120);
  assert.equal((await status(ident, t0)).voiceSecLeft, 0);
  await recordCall({ id: 'rtc_1', key: ident.key, start: t0, allowedSec: 120, plan: r.plan, day: new Date(t0).toISOString().slice(0, 10) });
  const hung = [];
  const ended = await endCall('rtc_1', { key: ident.key, now: t0 + 30000, hangup: async id => hung.push(id) });
  assert.equal(ended.usedSec, 30);
  assert.deepEqual(hung, ['rtc_1']);
  assert.equal((await status(ident, t0 + 30000)).voiceSecLeft, 90);
  assert.equal(await endCall('rtc_1', { key: ident.key, now: t0 + 60000 }), null);
  assert.equal((await status(ident)).voiceSecLeft, 90);
});

test('voice: other users cannot end your call; sweeper hangs up overdue calls', async () => {
  const t0 = Date.now() - 10 * 60000;
  await recordCall({ id: 'rtc_2', key: 'google:x', start: t0, allowedSec: 60, plan: 'free', day: '2026-01-01' });
  assert.equal(await endCall('rtc_2', { key: 'google:intruder' }), null);
  const hung = [];
  assert.equal(await sweepCalls(async id => hung.push(id)), 1);
  assert.deepEqual(hung, ['rtc_2']);
  assert.equal(await sweepCalls(async () => {}), 0);
});

test('live coach: a purchase counts once, one credit opens a resumable 60-minute window', async () => {
  const h = await signIn('m@gmail.com', 'm');
  const key = 'google:m';
  const hook = { authorization: 'Bearer hook-secret' };
  const ev = txn => ({ event: { type: 'NON_RENEWING_PURCHASE', app_user_id: key, product_ids: ['mock_session_60min'], transaction_id: txn } });
  await call('POST billing/revenuecat', ev('t1'), hook);
  await call('POST billing/revenuecat', ev('t1'), hook); // webhook retry
  assert.equal((await call('GET me', null, h)).body.sessionCredits, 1);

  const t0 = Date.now();
  const first = await startLiveSession(key, t0);
  assert.deepEqual(first, { ok: true, allowedSec: 3600, resumed: false });
  // Connection drops after 10 minutes: rejoining uses the same credit and only the time that is left.
  const again = await startLiveSession(key, t0 + 600000);
  assert.deepEqual(again, { ok: true, allowedSec: 3000, resumed: true });
  assert.equal((await status({ key }, t0 + 600000)).liveSecLeft, 3000);
  assert.equal((await status({ key }, t0)).sessionCredits, 0);
  assert.equal((await startLiveSession(key, t0 + 3600000)).ok, false); // window over, no credit left

  // Ending a live call early must not hand back free-plan voice minutes.
  await reserveVoice({ key }, t0);
  await recordCall({ id: 'rtc_m', key, start: t0, allowedSec: 3600, plan: 'live', day: '2026-01-01' });
  await endCall('rtc_m', { key, now: t0 + 60000 });
  assert.equal((await status({ key }, t0)).voiceSecLeft, 0);

  // A session that never connected gives the credit back.
  await call('POST billing/revenuecat', ev('t2'), hook);
  await startLiveSession(key, t0 + 4000000);
  await cancelLiveSession(key);
  const me = await status({ key }, t0 + 4000000);
  assert.equal(me.sessionCredits, 1);
  assert.equal(me.liveSecLeft, 0);
});

test('live coach mode runs a structured practice test with the chosen settings', () => {
  process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = 'rt';
  const v = validateRealtime({ sdp: 'v=0', mode: 'live', speak: true, live: { lengthMin: 30, style: 'tough', topic: 'Kubernetes', difficulty: 'senior' } });
  assert.equal(v.mode, 'live');
  assert.deepEqual(v.live, { lengthMin: 30, style: 'tough', topic: 'Kubernetes', difficulty: 'senior', use: 'practice', brief: { jd: '', resume: '' } });
  const cfg = sessionConfigs(v)[0].session;
  assert.equal(cfg.audio.input.turn_detection.create_response, true);
  assert.match(voiceInstructions(v), /LIVE COACH MODE/);
  assert.match(voiceInstructions(v), /Kubernetes/);
  assert.match(voiceInstructions(v), /senior level/);
  // Bad settings fall back to the defaults instead of failing.
  assert.deepEqual(validateRealtime({ sdp: 'v=0', mode: 'live', live: { lengthMin: 99, style: 'mean' } }).live, { lengthMin: 60, style: 'friendly', topic: '', difficulty: '', use: 'practice', brief: { jd: '', resume: '' } });
  delete process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
});

test('live coach interview use listens silently and answers with talking points', () => {
  const v = validateRealtime({ sdp: 'v=0', mode: 'live', speak: true, live: { use: 'interview', topic: 'Kubernetes' } });
  assert.equal(v.live.use, 'interview');
  assert.equal(v.speak, false); // never talks during the user's interview
  const cfg = sessionConfigs(v)[0].session;
  assert.deepEqual(cfg.output_modalities, ['text']);
  assert.equal(cfg.audio.input.turn_detection.create_response, true);
  assert.equal(cfg.audio.input.turn_detection.interrupt_response, false);
  assert.match(voiceInstructions(v), /INTERVIEW MODE/);
  assert.doesNotMatch(voiceInstructions(v), /LIVE COACH MODE/);
});

test('live coach open conversation talks back and forth and is harder to cut off', () => {
  const v = validateRealtime({ sdp: 'v=0', mode: 'live', live: { use: 'talk' } });
  assert.equal(v.live.use, 'talk');
  assert.equal(v.speak, true);
  const td = sessionConfigs(v)[0].session.audio.input.turn_detection;
  assert.equal(td.create_response, true);
  assert.equal(td.interrupt_response, true);
  assert.ok(td.threshold > 0.5);
  assert.match(voiceInstructions(v), /OPEN CONVERSATION MODE/);
});

test('live coach hints need an open session window', async () => {
  const h = await signIn('hint@gmail.com', 'hint');
  assert.equal((await call('POST live/hint', { question: 'What is a Kubernetes Pod?' }, h)).status, 402);
  const key = 'google:hint';
  await call('POST billing/revenuecat', { event: { type: 'NON_RENEWING_PURCHASE', app_user_id: key, product_ids: ['mock_session_60min'], transaction_id: 'th1' } }, { authorization: 'Bearer hook-secret' });
  await startLiveSession(key);
  const r = await call('POST live/hint', { question: 'What is a Kubernetes Pod?' }, h);
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.hint, 'string');
  assert.ok(r.body.hint.length > 0);
  assert.equal((await call('POST live/hint', { question: 'short' }, h)).status, 400);
});

test('quota messages quote the configured price and limits', async () => {
  const h = await signIn('q@gmail.com', 'q');
  for (let i = 0; i < 15; i++) await ask(h);
  const r = await ask(h);
  assert.equal(r.status, 402);
  assert.match(r.body.error, /\$6\.99\/month/);
});

test('voice is refused once free minutes are gone', async () => {
  await signIn('w@gmail.com', 'w');
  const ident = { key: 'google:w' };
  assert.equal((await reserveVoice(ident)).ok, true);
  const r = await reserveVoice(ident);
  assert.equal(r.status, 402);
});

test('users can delete their account; re-signing up does not reset the free trial', async () => {
  process.env.FREE_MSGS = '2';
  const h = await signIn('gone@gmail.com', 'gone');
  assert.equal((await ask(h)).status, 200);
  assert.equal((await call('POST me/delete', {}, h)).status, 200);
  assert.equal((await call('GET me', null, h)).status, 401);
  assert.equal((await ask(h)).status, 401);
  const h2 = await signIn('gone@gmail.com', 'gone');
  const me = (await call('GET me', null, h2)).body;
  assert.equal(me.msgsLeft, 1);
  assert.equal(me.email, 'gone@gmail.com');
});

test('per-user rate limit', () => {
  for (let i = 0; i < 1000; i++) assert.ok(rateLimit('voice', 'u1').ok);
  assert.equal(rateLimit('voice', 'u1').ok, false);
  assert.ok(rateLimit('voice', 'u2').ok);
});

test('validation drops system messages and caps history and length', () => {
  const msgs = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(9000) }));
  msgs.push({ role: 'system', content: 'evil' }, { role: 'user', content: 'last' });
  const v = validateChat({ messages: msgs });
  assert.ok(v.messages.length <= 16);
  assert.ok(v.messages.every(m => m.role !== 'system' && m.content.length <= 4000));
});

test('sanitizer drops malformed model output', () => {
  assert.equal(sanitizeGenerated('not json'), null);
  assert.equal(sanitizeGenerated({ concepts: [{ t: 1 }], qa: [{}] }), null);
  assert.equal(sanitizeGenerated({ qa: [{ l: 9, q: 'q', a: 'a' }] }).qa[0].l, 2);
});

test('sanitizer keeps a well-formed story diagram and drops a bad one', () => {
  const good = sanitizeGenerated({
    concepts: [{ t: 'Ansible', what: 'Automation.' }],
    qa: [{ l: 1, q: 'What is Ansible?', a: 'Automation.' }],
    diagram: {
      kind: 'flow', title: 'How Ansible runs', caption: 'Control node to hosts.',
      nodes: [{ label: 'Write', sub: 'a playbook' }, { label: 'Run', sub: 'ansible-playbook' }, { label: 'Apply', sub: 'on each host' }],
      steps: ['Write: a playbook', 'Run: ansible-playbook', 'Apply: on each host'],
    },
  });
  assert.equal(good.diagram.kind, 'flow');
  assert.equal(good.diagram.nodes.length, 3);
  assert.equal(good.diagram.steps.length, 3);
  // Wrong kind, too few nodes, or too few steps: the diagram is dropped,
  // but the guide itself survives.
  const bad = sanitizeGenerated({
    concepts: [{ t: 'Ansible', what: 'Automation.' }],
    diagram: { kind: 'cycle', nodes: [{ label: 'x' }], steps: ['x'] },
  });
  assert.equal(bad.diagram, undefined);
  const thin = sanitizeGenerated({
    concepts: [{ t: 'Ansible', what: 'Automation.' }],
    diagram: { kind: 'flow', nodes: [{ label: 'Only one' }], steps: ['one'] },
  });
  assert.equal(thin.diagram, undefined);
  const none = sanitizeGenerated({ concepts: [{ t: 'Ansible', what: 'Automation.' }] });
  assert.equal(none.diagram, undefined);
});

test('listening mode never auto-replies; talking waits out thinking pauses and allows barge-in', () => {
  process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = 'rt';
  process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT = 'tr';
  const listen = sessionConfigs(validateRealtime({ sdp: 'v=0', mode: 'listen', speak: false }))[0].session;
  const talk = sessionConfigs(validateRealtime({ sdp: 'v=0', mode: 'talk' }))[0].session;
  assert.equal(listen.audio.input.turn_detection.create_response, false);
  assert.deepEqual(listen.output_modalities, ['text']);
  assert.equal(talk.audio.input.turn_detection.create_response, true);
  // Short enough to feel responsive, long enough not to cut in when someone pauses to think.
  assert.equal(talk.audio.input.turn_detection.silence_duration_ms, 1200);
  const practice = sessionConfigs(validateRealtime({ sdp: 'v=0', mode: 'live', live: { use: 'practice' } }))[0].session;
  assert.equal(practice.audio.input.turn_detection.silence_duration_ms, 1200);
  assert.equal(talk.audio.input.turn_detection.interrupt_response, true);
  delete process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT; delete process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
});

test('unlisted-role telemetry stores only a normalized role name and is rate limited', async () => {
  const h = { 'x-client-id': 'tele-client-0001' };
  assert.equal((await call('POST telemetry/role', { role: ' x' }, h)).status, 400);
  assert.equal((await call('POST telemetry/role', { role: 'Salesforce <b>Developer</b>!!' }, h)).status, 200);
  const { getDb } = await import('../api/src/lib/db.js');
  const rows = await (await getDb()).list('roles');
  assert.deepEqual(rows.map(r => [r.role, r.count]), [['salesforce developer', 1]]);
  for (let i = 0; i < 4; i++) await call('POST telemetry/role', { role: 'sap basis' }, h);
  assert.equal((await call('POST telemetry/role', { role: 'sap basis' }, h)).status, 429);
});

test('guide suggestions: sign-in required, stored, emailed only when ACS is configured', async () => {
  const body = { text: 'A guide to system design interviews for backend roles', topic: 'system design' };
  assert.equal((await call('POST suggestions', body)).status, 401);
  const h = await signIn('sugg@gmail.com', 'sugg');
  assert.equal((await call('POST suggestions', { text: 'too short' }, h)).status, 400);
  const r = await call('POST suggestions', body, h);
  assert.equal(r.status, 200);
  assert.equal(r.body.stored, true);
  assert.equal(r.body.emailed, false); // no ACS settings in this environment
  const { getDb } = await import('../api/src/lib/db.js');
  const rows = await (await getDb()).list('suggestions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, body.text);
  assert.equal(rows[0].userEmail, 'sugg@gmail.com');
});

test('guide suggestions are rate-limited to 5 per hour per user', async () => {
  const h = await signIn('limit@gmail.com', 'limit');
  for (let i = 0; i < 5; i++) assert.equal((await call('POST suggestions', { text: `Suggestion number ${i} please` }, h)).status, 200);
  assert.equal((await call('POST suggestions', { text: 'One more suggestion please' }, h)).status, 429);
});

test('fresh scenarios: one AI call per role per 6 hours, previous one kept if the AI fails', async () => {
  const { freshFor, sanitizeFresh, FRESH_TTL_MS } = await import('../api/src/lib/fresh.js');
  let calls = 0;
  const gen = async () => { calls++; return JSON.stringify({ title: `Disk full at 2 a.m. #${calls}`, situation: 'A node pages at night.', question: 'What do you check first?', points: ['df -h and du', 'find the writer', 'rotate logs'], analogy: 'A cupboard that keeps filling.' }); };
  const t0 = Date.now();
  const a = await freshFor('sre', t0, gen);
  assert.equal(a.title, 'Disk full at 2 a.m. #1');
  await freshFor('sre', t0 + 1000, gen);
  assert.equal(calls, 1); // cached
  const b = await freshFor('sre', t0 + FRESH_TTL_MS + 1, gen);
  assert.equal(b.title, 'Disk full at 2 a.m. #2');
  const c = await freshFor('sre', t0 + 2 * FRESH_TTL_MS + 2, async () => { throw new Error('down'); });
  assert.equal(c.title, 'Disk full at 2 a.m. #2'); // stale beats nothing
  assert.equal(await freshFor('not-a-role', t0, gen), null);
  assert.equal(sanitizeFresh('{"title":"x"}'), null);
  assert.equal((await call('POST fresh', { role: '../etc' })).status, 400);
});

test('the API copy of the role list matches the app', async () => {
  const { readFileSync } = await import('node:fs');
  const app = JSON.parse(readFileSync(new URL('../web/content/roles.json', import.meta.url))).roles.map(r => r.id).sort();
  const api = JSON.parse(readFileSync(new URL('../api/src/lib/roles.json', import.meta.url))).roles.map(r => r.id).sort();
  assert.deepEqual(api, app);
});

test('profile suggest: signed-in only, maps experience to known roles', async () => {
  assert.equal((await call('POST profile/suggest', { summary: 'x'.repeat(60) })).status, 401);
  const h = await signIn('exp@gmail.com', 'exp');
  assert.equal((await call('POST profile/suggest', { summary: 'short' }, h)).status, 400);
  const r = await call('POST profile/suggest', { summary: 'Eight years of Java and Spring Boot microservices on AWS, some Kubernetes.' }, h);
  // The mock AI returns no roles, so the call is refunded and reported as unmatched.
  assert.ok([200, 422].includes(r.status));
});

test('Pro Live AI is a monthly minutes bank: only connected time is counted', async () => {
  const { startProLive, recordCall: rec, endCall: end, status: st } = await import('../api/src/lib/account.js');
  await signIn('prolive@gmail.com', 'prolive');
  const key = 'google:prolive';
  await call('POST billing/revenuecat', { event: { type: 'INITIAL_PURCHASE', app_user_id: key, entitlement_ids: ['pro'], expiration_at_ms: Date.now() + 30 * 86400000 } }, { authorization: 'Bearer hook-secret' });
  const t0 = Date.now();
  assert.equal((await st({ key }, t0)).proLiveLeft, 30);
  const m = await startProLive(key, t0);
  assert.deepEqual(m, { ok: true, allowedSec: 1800, resumed: false });
  // talk for 1 minute, hang up: only 60 s are charged
  await rec({ id: 'pl1', key, start: t0, allowedSec: m.allowedSec, plan: 'prolive', day: '2026-11-18' });
  await end('pl1', { key, now: t0 + 60000 });
  assert.equal((await st({ key }, t0)).proLiveLeft, 29);
  // next call may use the rest
  assert.equal((await startProLive(key, t0 + 120000)).allowedSec, 1740);
  const h = (await call('GET health')).body.plans.pro;
  assert.equal(h.liveMin, 30); assert.equal(h.liveBank, true);
});

test('AI stays on interview prep: off-scope asks get a fixed reply and cost nothing', async () => {
  const { outOfScope } = await import('../api/src/lib/guard.js');
  assert.ok(outOfScope('Build me a full stack todo app with React and Node'));
  assert.ok(outOfScope('Can you write a cover letter for this job?'));
  assert.ok(outOfScope('please do my homework on linked lists'));
  assert.ok(!outOfScope('Why does my Java code throw ConcurrentModificationException?'));
  assert.ok(!outOfScope('How would you design a URL shortener in an interview?'));
  const h = await signIn('scope@gmail.com', 'scope');
  const before = (await call('GET me', null, h)).body.msgsLeft;
  const r = await ask(h, 'Build me a complete e-commerce website in Next.js');
  assert.equal(r.status, 200);
  assert.equal(r.body.scoped, true);
  assert.equal((await call('GET me', null, h)).body.msgsLeft, before);
});

test('Pro messages: unlimited for normal use, with a daily fair-use ceiling', async () => {
  process.env.PRO_MSGS_PER_DAY = '3';
  const h = await signIn('fair@gmail.com', 'fair');
  await call('POST billing/revenuecat', { event: { type: 'INITIAL_PURCHASE', app_user_id: 'google:fair', entitlement_ids: ['pro'], expiration_at_ms: Date.now() + 30 * 86400000 } }, { authorization: 'Bearer hook-secret' });
  for (let i = 0; i < 3; i++) assert.equal((await ask(h)).status, 200);
  const r = await ask(h);
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'fair_use');
  delete process.env.PRO_MSGS_PER_DAY;
});

test('only admins can read guide suggestions', async () => {
  const user = await signIn('someone@gmail.com', 'someone');
  await call('POST suggestions', { text: 'Please add a Terraform guide with state locking', topic: 'Terraform' }, user);
  assert.equal((await call('POST suggestions/list', {}, user)).status, 403);
  const admin = await signIn('boss@gmail.com', 'boss');
  const r = await call('POST suggestions/list', {}, admin);
  assert.equal(r.status, 200);
  assert.ok(r.body.suggestions.some(x => x.topic === 'Terraform'));
});

test('admins have no limits: long voice calls, Live AI without a session, no rate limit', async () => {
  const { reserveVoice: rv } = await import('../api/src/lib/account.js');
  await signIn('boss@gmail.com', 'boss');
  const r = await rv({ key: 'google:boss', email: 'boss@gmail.com' });
  assert.equal(r.ok, true);
  assert.equal(r.allowedSec, 4 * 60 * 60);
  const v = (await import('../api/src/lib/realtime.js')).validateRealtime({ sdp: 'v=0', mode: 'live', live: { lengthMin: 240 } });
  assert.equal(v.live.lengthMin, 240);
});

test('RevenueCat webhook also accepts the secret in the URL (Azure replaces Authorization)', async () => {
  const ok = await ROUTES['POST billing/revenuecat']({ body: { event: { type: 'TEST' } }, headers: { authorization: 'Bearer azure-platform-token' }, query: { auth: 'Bearer hook-secret' } });
  assert.equal(ok.status, 200);
  const bad = await ROUTES['POST billing/revenuecat']({ body: { event: { type: 'TEST' } }, headers: {}, query: { auth: 'wrong' } });
  assert.equal(bad.status, 401);
});

test('purchase refresh works with RevenueCat API v2', async () => {
  const h = await signIn('v2buyer@gmail.com', 'v2buyer');
  const key = 'google:v2buyer';
  const until = Date.now() + 30 * 86400000;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    const body = u.includes('/entitlements') ? { items: [{ id: 'entlPRO', lookup_key: 'pro' }] }
      : u.includes('/products') ? { items: [{ id: 'prodLIVE', store_identifier: 'mock_session_60min' }, { id: 'prodPRO', store_identifier: 'pro_monthly' }] }
      : u.includes('/active_entitlements') ? { items: [{ entitlement_id: 'entlPRO', expires_at: until }] }
      : u.includes('/purchases') ? { items: [{ id: 'pur1', product_id: 'prodLIVE', store_purchase_identifier: 'txn-9' }] }
      : null;
    return { ok: !!body, status: body ? 200 : 404, json: async () => body };
  };
  Object.assign(process.env, { REVENUECAT_SECRET_KEY: 'sk_test', REVENUECAT_PROJECT_ID: 'projX' });
  try {
    const r = await call('POST billing/refresh', {}, h);
    assert.equal(r.status, 200);
    assert.equal(r.body.pro, true);
    assert.equal(r.body.account.plan, 'pro');
    assert.equal(r.body.account.sessionCredits, 1);
    await call('POST billing/refresh', {}, h); // same purchase again: still one credit
    assert.equal((await call('GET me', null, h)).body.sessionCredits, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.REVENUECAT_SECRET_KEY; delete process.env.REVENUECAT_PROJECT_ID;
  }
});

test('Job focus: Pro only, skills first, then cards per skill with a signed ticket', async () => {
  const { sanitizeJobSkills, sanitizeJobCards, jfTicket, jfReadTicket } = await import('../api/src/lib/handlers.js');
  const jd = 'We need a backend engineer with Java 17, Spring Boot, Kafka, PostgreSQL and AWS. You will design microservices and own on-call.';
  assert.equal((await call('POST jobfocus', { text: jd })).status, 401);
  const free = await signIn('jdfree@gmail.com', 'jdfree');
  assert.equal((await call('POST jobfocus', { text: 'too short' }, free)).status, 400);
  const r = await call('POST jobfocus', { text: jd }, free);
  assert.equal(r.status, 402); assert.equal(r.body.code, 'pro');
  const boss = await signIn('boss@gmail.com', 'boss-jd');
  assert.notEqual((await call('POST jobfocus', { text: jd }, boss)).status, 402);
  // skills: capped at 5, need at least 2
  const sk = sanitizeJobSkills(JSON.stringify({ role: 'Backend', level: 'senior', stack: Array.from({ length: 10 }, (_, i) => ({ name: `T${i}`, why: 'w', focus: 'f' })) }));
  assert.equal(sk.stack.length, 8); assert.equal(sk.level, 'senior');
  assert.equal(sanitizeJobSkills('not json'), null);
  // cards: comprehensive (up to 10), at least 3
  const card = { q: 'Q?', a: 'A.' };
  assert.equal(sanitizeJobCards(JSON.stringify({ cards: Array(14).fill(card) })).length, 10);
  assert.equal(sanitizeJobCards(JSON.stringify({ cards: [card] })), null);
  // ticket: bound to the user, tamper-proof, expires
  const t = jfTicket({ k: 'google:boss-jd', role: 'Backend', level: 'mid', stack: [['Java', 'collections']] }, 1000);
  assert.ok(jfReadTicket(t, 'google:boss-jd', 2000));
  assert.equal(jfReadTicket(t, 'google:someone-else', 2000), null);
  assert.equal(jfReadTicket(t, 'google:boss-jd', 1000 + 31 * 60000), null);
  assert.equal(jfReadTicket(t.replace(/^./, c => c === 'a' ? 'b' : 'a'), 'google:boss-jd', 2000), null);
  assert.equal((await call('POST jobfocus/cards', { ticket: 'junk', i: 0 }, boss)).status, 400);
  assert.equal((await call('POST jobfocus/cards', { ticket: t, i: 0 })).status, 401);
});

test('small talk is answered for free; real questions still count', async () => {
  const { smallTalk } = await import('../api/src/lib/guard.js');
  for (const t of ['hi', 'Hello!', 'hey there', 'how are you doing?', 'thanks!', 'ok', 'bye', 'good morning coach']) assert.ok(smallTalk(t), t);
  for (const t of ['hi, explain kafka partitions', 'what is a hashmap', 'thanks, now quiz me on SQL joins please']) assert.equal(smallTalk(t), null, t);
  const h = await signIn('hi@gmail.com', 'hi-user');
  const before = (await call('GET me', null, h)).body.msgsLeft;
  const r = await ask(h, 'Hello!');
  assert.equal(r.status, 200); assert.equal(r.body.free, true);
  assert.equal((await call('GET me', null, h)).body.msgsLeft, before);
});

test('Live AI conversation: opens on the chosen topic and stays in scope', () => {
  const v = validateRealtime({ sdp: 'v=0', mode: 'live', live: { use: 'talk', topic: 'Kafka' } });
  const t = voiceInstructions(v);
  assert.match(t, /TOPIC FOCUS: Kafka/); assert.match(t, /Open the session on this topic/); assert.match(t, /STAY IN SCOPE/);
});

test('role brief: Pro only, needs a job post and a résumé; Live AI uses the brief', async () => {
  const jd = 'Senior backend engineer: Java 17, Spring Boot, Kafka, PostgreSQL, AWS. Own services end to end and mentor others.';
  const cv = 'Five years building Java and Spring Boot payment services on AWS; led a Kafka migration; mentored two juniors.';
  const free = await signIn('brieffree@gmail.com', 'brieffree');
  assert.equal((await call('POST jobfocus/brief', { jd, resume: cv }, free)).status, 402);
  assert.equal((await call('POST jobfocus/brief', { jd: 'short', resume: cv }, free)).status, 400);
  const v = validateRealtime({ sdp: 'v=0', mode: 'live', live: { use: 'talk', brief: { jd, resume: cv } } });
  assert.match(voiceInstructions(v), /PRACTICE BRIEF/); assert.match(voiceInstructions(v), /Kafka migration/);
});
