// Replaces the App Review screenshot and review note on the Pro subscription and the Live AI
// one-time purchase (store/review/*.png). Uses the App Store Connect key in GitHub secrets.
import { createSign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const SUB = '6835597421', IAP = '6835659087';
const NOTES = {
  sub: 'PrepPilot Pro, $6.99/month with a 3-day free trial for new subscribers. Unlocks every topic and card, unlimited AI coach messages, and 30 Live AI minutes a month (a voice mock interview for practice; only connected time counts). To test: Profile or Pricing > Try Pro free for 3 days. Sign in with Apple works for review.',
  iap: 'Live AI, one 60-minute session ($15.99, consumable). A spoken mock interview with an AI interviewer for practice, for users who want a full hour before an interview. To test: Pricing > Buy one session, then AI > Live AI > Start. The microphone is used only during a session the user starts.',
};

const b64u = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = `${b64u({ alg: 'ES256', kid, typ: 'JWT' })}.${b64u({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
const token = `${head}.${createSign('SHA256').update(head).sign({ key: p8.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
const API = 'https://api.appstoreconnect.apple.com';
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(data.errors?.map(e => e.detail || e.title))}`);
  return data;
}
async function replaceShot({ current, del, create, relName, relType, relId, file }) {
  const cur = await api('GET', current).catch(() => ({ data: null }));
  if (cur.data?.id) { await api('DELETE', `${del}/${cur.data.id}`); console.log(`  removed old screenshot`); }
  const bytes = readFileSync(file);
  const shot = (await api('POST', create, { data: { type: create.split('/').pop(), attributes: { fileName: file.split('/').pop(), fileSize: bytes.length },
    relationships: { [relName]: { data: { type: relType, id: relId } } } } })).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error(`upload -> ${r.status}`);
  }
  await api('PATCH', `${del}/${shot.id}`, { data: { type: create.split('/').pop(), id: shot.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } });
  console.log(`  + ${file}`);
}

console.log('Pro subscription');
await replaceShot({ current: `/v1/subscriptions/${SUB}/appStoreReviewScreenshot`, del: '/v1/subscriptionAppStoreReviewScreenshots', create: '/v1/subscriptionAppStoreReviewScreenshots',
  relName: 'subscription', relType: 'subscriptions', relId: SUB, file: 'store/review/pro.png' });
await api('PATCH', `/v1/subscriptions/${SUB}`, { data: { type: 'subscriptions', id: SUB, attributes: { reviewNote: NOTES.sub } } });
console.log('  review note set');

console.log('Live AI one-time purchase');
await replaceShot({ current: `/v2/inAppPurchases/${IAP}/appStoreReviewScreenshot`, del: '/v1/inAppPurchaseAppStoreReviewScreenshots', create: '/v1/inAppPurchaseAppStoreReviewScreenshots',
  relName: 'inAppPurchaseV2', relType: 'inAppPurchases', relId: IAP, file: 'store/review/live.png' });
await api('PATCH', `/v2/inAppPurchases/${IAP}`, { data: { type: 'inAppPurchases', id: IAP, attributes: { reviewNote: NOTES.iap } } });
console.log('  review note set');
console.log('Done.');
