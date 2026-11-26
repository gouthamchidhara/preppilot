// Uploads the App Store text in store/listing.json to the version being prepared:
// description, keywords, promotional text, URLs, subtitle, privacy policy and App Review notes.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const APP = process.env.APP_ID || '6835532732';
const L = JSON.parse(readFileSync('store/listing.json', 'utf8'));
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
const step = async (label, fn) => { try { await fn(); console.log(`✓ ${label}`); } catch (e) { console.log(`✗ ${label}: ${e.message}`); } };

const vers = await api('GET', `/v1/apps/${APP}/appStoreVersions?limit=5`);
const v = vers.data.find(x => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
if (!v) throw new Error('No version in Prepare for Submission.');
console.log(`Version ${v.attributes.versionString}`);
const locs = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
for (const loc of locs.data) {
  await step(`${loc.attributes.locale}: description, keywords, promotional text, support and marketing URLs`, () => api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id,
    attributes: { description: L.description, keywords: L.keywords, promotionalText: L.promotionalText, supportUrl: L.supportUrl, marketingUrl: L.marketingUrl } } }));
}
const infos = await api('GET', `/v1/apps/${APP}/appInfos`);
const info = infos.data.find(i => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(i.attributes.appStoreState || i.attributes.state)) || infos.data[0];
const ilocs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`);
for (const il of ilocs.data) {
  await step(`${il.attributes.locale}: subtitle and privacy policy URL`, () => api('PATCH', `/v1/appInfoLocalizations/${il.id}`, { data: { type: 'appInfoLocalizations', id: il.id,
    attributes: { subtitle: L.subtitle, privacyPolicyUrl: L.privacyPolicyUrl } } }));
}
const rd = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => ({ data: null }));
if (rd.data) {
  await step('App Review notes', () => api('PATCH', `/v1/appStoreReviewDetails/${rd.data.id}`, { data: { type: 'appStoreReviewDetails', id: rd.data.id, attributes: { notes: L.reviewNotes, demoAccountRequired: false } } }));
  const a = rd.data.attributes;
  console.log(`  Review contact on file: ${a.contactFirstName ? 'name ✓' : 'name MISSING'}, ${a.contactEmail ? 'email ✓' : 'email MISSING'}, ${a.contactPhone ? 'phone ✓' : 'phone MISSING'}`);
} else {
  await step('App Review notes (new)', () => api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: { notes: L.reviewNotes, demoAccountRequired: false },
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } }));
  console.log('  Review contact (name, email, phone) is not set: add it in App Store Connect > App Review Information.');
}
console.log('Done.');
