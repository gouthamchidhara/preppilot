import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

for (const k of ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT', 'AZURE_OPENAI_REALTIME_DEPLOYMENT', 'ACCESS_CODE', 'STORAGE_CONNECTION_STRING']) delete process.env[k];
Object.assign(process.env, {
  RATE_CHAT_PER_HOUR: '1000', RATE_GENERATE_PER_HOUR: '1000', RATE_VOICE_PER_HOUR: '1000',
  GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com', APPLE_AUDIENCES: 'com.gchid.preppilot',
  ADMIN_EMAILS: 'boss@gmail.com', SESSION_SECRET: 'x'.repeat(40), REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret',
});

const { ROUTES } = await import('../api/src/lib/routes.js');
const { setJwksFetcher } = await import('../api/src/lib/auth.js');
const { useMemoryDb } = await import('../api/src/lib/db.js');
const { reserveVoice, recordCall, endCall, sweepCalls, status, startMockSession, cancelMockSession } = await import('../api/src/lib/account.js');
const { rateLimit, resetRateLimits, sanitizeGenerated, validateChat } = await import('../api/src/lib/guard.js');
const { validateRealtime, sessionConfigs } = await import('../api/src/lib/realtime.js');

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
const ask = (h, text = 'hi') => call('POST chat', { messages: [{ role: 'user', content: text }] }, h);

beforeEach(async () => {
  await useMemoryDb(); resetRateLimits();
  delete process.env.FREE_MSGS; delete process.env.FREE_DAILY_MSGS; delete process.env.FREE_DAILY_VOICE_SEC;
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
  assert.equal(me.msgsLeft, 500);
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

test('mock interview: a purchase counts once, one credit opens a resumable 60-minute window', async () => {
  const h = await signIn('m@gmail.com', 'm');
  const key = 'google:m';
  const hook = { authorization: 'Bearer hook-secret' };
  const ev = txn => ({ event: { type: 'NON_RENEWING_PURCHASE', app_user_id: key, product_ids: ['mock_session_60min'], transaction_id: txn } });
  await call('POST billing/revenuecat', ev('t1'), hook);
  await call('POST billing/revenuecat', ev('t1'), hook); // webhook retry
  assert.equal((await call('GET me', null, h)).body.sessionCredits, 1);

  const t0 = Date.now();
  const first = await startMockSession(key, t0);
  assert.deepEqual(first, { ok: true, allowedSec: 3600, resumed: false });
  // Connection drops after 10 minutes: rejoining uses the same credit and only the time that is left.
  const again = await startMockSession(key, t0 + 600000);
  assert.deepEqual(again, { ok: true, allowedSec: 3000, resumed: true });
  assert.equal((await status({ key }, t0 + 600000)).mockSecLeft, 3000);
  assert.equal((await status({ key }, t0)).sessionCredits, 0);
  assert.equal((await startMockSession(key, t0 + 3600000)).ok, false); // window over, no credit left

  // Ending a mock call early must not hand back free-plan voice minutes.
  await reserveVoice({ key }, t0);
  await recordCall({ id: 'rtc_m', key, start: t0, allowedSec: 3600, plan: 'mock', day: '2026-01-01' });
  await endCall('rtc_m', { key, now: t0 + 60000 });
  assert.equal((await status({ key }, t0)).voiceSecLeft, 0);

  // A session that never connected gives the credit back.
  await call('POST billing/revenuecat', ev('t2'), hook);
  await startMockSession(key, t0 + 4000000);
  await cancelMockSession(key);
  const me = await status({ key }, t0 + 4000000);
  assert.equal(me.sessionCredits, 1);
  assert.equal(me.mockSecLeft, 0);
});

test('quota messages quote the configured price and limits', async () => {
  const h = await signIn('q@gmail.com', 'q');
  for (let i = 0; i < 15; i++) await ask(h);
  const r = await ask(h);
  assert.equal(r.status, 402);
  assert.match(r.body.error, /\$11\.99\/month/);
  assert.equal((await call('GET health')).body.plans.mock.price, '$10.99');
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

test('listening mode never auto-replies; talking mode replies fast and allows barge-in', () => {
  process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = 'rt';
  process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT = 'tr';
  const listen = sessionConfigs(validateRealtime({ sdp: 'v=0', mode: 'listen', speak: false }))[0].session;
  const talk = sessionConfigs(validateRealtime({ sdp: 'v=0', mode: 'talk' }))[0].session;
  assert.equal(listen.audio.input.turn_detection.create_response, false);
  assert.deepEqual(listen.output_modalities, ['text']);
  assert.equal(talk.audio.input.turn_detection.create_response, true);
  assert.ok(talk.audio.input.turn_detection.silence_duration_ms <= 400);
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
