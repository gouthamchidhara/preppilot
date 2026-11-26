// Replaces the App Store iPhone screenshots (6.7"/6.9" slot, 1290x2796) of the version being prepared
// with the images in store/screenshots/, in file-name order. Uses the key in GitHub secrets.
// Prints what it did; never prints the key or the token.
import { createSign, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const APP = process.env.APP_ID || '6835532732';
const TYPE = 'APP_IPHONE_67';
const DIR = 'store/screenshots';
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];

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

const versions = await api('GET', `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=10`);
versions.data.forEach(v => console.log(`Version ${v.attributes.versionString}: ${v.attributes.appStoreState}`));
const version = versions.data.find(v => EDITABLE.includes(v.attributes.appStoreState));
if (!version) throw new Error('No version open for editing (it must be "Prepare for Submission").');
console.log(`Updating screenshots of version ${version.attributes.versionString}`);

const locs = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
const files = readdirSync(DIR).filter(f => f.endsWith('.png')).sort();
for (const loc of locs.data) {
  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`);
  let set = sets.data.find(s => s.attributes.screenshotDisplayType === TYPE);
  if (!set) {
    set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: TYPE },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
  }
  const old = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
  for (const s of old.data) await api('DELETE', `/v1/appScreenshots/${s.id}`);
  console.log(`${loc.attributes.locale}: removed ${old.data.length} old screenshot(s)`);
  for (const f of files) {
    const bytes = readFileSync(`${DIR}/${f}`);
    const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
      const r = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error(`upload ${f} -> ${r.status}`);
    }
    await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } });
    console.log(`  + ${f}`);
  }
}
console.log('Done. Apple processes new screenshots for a few minutes before they show.');
