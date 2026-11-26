// New App Store account setup, step by step and safe to rerun.
// Step 1 (this run): check the key, create the bundle ID with Sign in with Apple and push, and look
// for the app record (Apple only lets a person create that one, in App Store Connect > New App).
import { createSign } from 'node:crypto';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const BUNDLE = process.env.BUNDLE_ID || 'us.preppilot.app';
const NAME = 'PrepPilot';

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

const apps = await api('GET', '/v1/apps?limit=20');
console.log(`Key works. Apps in this account: ${apps.data.map(a => `${a.attributes.name} (${a.attributes.bundleId})`).join(', ') || 'none yet'}`);

let bid = (await api('GET', `/v1/bundleIds?filter[identifier]=${BUNDLE}`)).data.find(b => b.attributes.identifier === BUNDLE);
if (!bid) {
  bid = (await api('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier: BUNDLE, name: NAME, platform: 'IOS' } } })).data;
  console.log(`Created bundle ID ${BUNDLE}`);
} else console.log(`Bundle ID ${BUNDLE} already exists`);
const caps = (await api('GET', `/v1/bundleIds/${bid.id}/bundleIdCapabilities`)).data.map(c => c.attributes.capabilityType);
for (const [type, settings] of [['APPLE_ID_AUTH', [{ key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{ key: 'PRIMARY_APP_CONSENT' }] }]], ['PUSH_NOTIFICATIONS', undefined]]) {
  if (caps.includes(type)) { console.log(`  ${type}: already on`); continue; }
  await api('POST', '/v1/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: type, ...(settings ? { settings } : {}) },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bid.id } } } } }).then(() => console.log(`  ${type}: switched on`), e => console.log(`  ${type}: ${e.message}`));
}
const app = apps.data.find(a => a.attributes.bundleId === BUNDLE);
console.log(app ? `App record found: ${app.attributes.name} (id ${app.id})` : `No app record yet. Create it in App Store Connect > Apps > + > New App with bundle ID ${BUNDLE}.`);
