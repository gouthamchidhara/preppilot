// Checks the whole App Store setup for PrepPilot and, with FIX=1, limits the Pro subscription and the
// Live AI purchase to the United States (the app itself is already US-only). Prints a readable report.
import { createSign } from 'node:crypto';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const APP = '6835532732', SUB = '6835597421', IAP = '6835659087';
const FIX = process.env.FIX === '1';
const ONLY = ['USA'];

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
const tryApi = (...a) => api(...a).catch(e => ({ error: e.message }));
async function territories(path) {
  const out = []; let next = path;
  while (next) { const d = await api('GET', next.replace(API, '')); out.push(...d.data.map(t => t.id)); next = d.links?.next || null; }
  return out;
}
const show = (label, ids) => console.log(`  ${label}: ${ids.length} ${ids.length <= 6 ? `(${ids.join(', ')})` : `(e.g. ${ids.slice(0, 6).join(', ')}…)`}`);

// App
const app = await api('GET', `/v1/apps/${APP}`);
console.log(`APP: ${app.data.attributes.name} (${app.data.attributes.bundleId})`);
const appAv = await tryApi('GET', `/v1/apps/${APP}/appAvailabilityV2`);
if (appAv.data) {
  const tav = await api('GET', `/v2/appAvailabilities/${appAv.data.id}/territoryAvailabilities?limit=200&filter[available]=true`).catch(() => null)
    || await api('GET', `/v2/appAvailabilities/${appAv.data.id}/territoryAvailabilities?limit=200`);
  const avail = tav.data.filter(t => t.attributes.available).map(t => t.relationships?.territory?.data?.id || t.id);
  show('Sold in', avail);
} else console.log(`  availability: ${appAv.error}`);
const vers = await api('GET', `/v1/apps/${APP}/appStoreVersions?limit=5`);
vers.data.forEach(v => console.log(`  Version ${v.attributes.versionString}: ${v.attributes.appStoreState}`));

// Subscription
const sub = await api('GET', `/v1/subscriptions/${SUB}`);
const s = sub.data.attributes;
console.log(`\nSUBSCRIPTION: ${s.name} (${s.productId}) state ${s.state}, period ${s.subscriptionPeriod}, family sharing ${s.familySharable}`);
const subLoc = await api('GET', `/v1/subscriptions/${SUB}/subscriptionLocalizations`);
subLoc.data.forEach(l => console.log(`  ${l.attributes.locale}: "${l.attributes.name}" / "${l.attributes.description}"`));
const prices = await api('GET', `/v1/subscriptions/${SUB}/prices?filter[territory]=USA&include=subscriptionPricePoint&limit=20`);
console.log(`  USA price(s): ${(prices.included || []).map(x => '$' + x.attributes.customerPrice).join(', ')}`);
const offers = await api('GET', `/v1/subscriptions/${SUB}/introductoryOffers?include=territory&limit=50`);
console.log(`  Intro offers: ${offers.data.map(o => `${o.attributes.offerMode} ${o.attributes.duration} (${o.relationships?.territory?.data?.id || '?'})`).join(', ') || 'none'}`);
const subAv = await tryApi('GET', `/v1/subscriptions/${SUB}/subscriptionAvailability`);
let subTerr = [];
if (subAv.data) { subTerr = await territories(`/v1/subscriptionAvailabilities/${subAv.data.id}/availableTerritories?limit=200`); show('Sold in', subTerr); console.log(`  New countries added automatically: ${subAv.data.attributes.availableInNewTerritories}`); }
else console.log('  Sold in: not set yet');
if (FIX && (subTerr.join() !== ONLY.join() || subAv.data?.attributes.availableInNewTerritories)) {
  await api('POST', '/v1/subscriptionAvailabilities', { data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: false },
    relationships: { subscription: { data: { type: 'subscriptions', id: SUB } }, availableTerritories: { data: ONLY.map(id => ({ type: 'territories', id })) } } } });
  console.log('  -> now sold in the United States only');
}
const group = await tryApi('GET', `/v1/subscriptions/${SUB}/group`);
if (group.data) {
  const gl = await api('GET', `/v1/subscriptionGroups/${group.data.id}/subscriptionGroupLocalizations`);
  console.log(`  Group "${group.data.attributes.referenceName}": ${gl.data.map(l => `${l.attributes.locale} "${l.attributes.name}"`).join(', ') || 'NO display name (needed for review)'}`);
}
const subShot = await tryApi('GET', `/v1/subscriptions/${SUB}/appStoreReviewScreenshot`);
console.log(`  Review screenshot: ${subShot.data ? 'yes' : 'MISSING'}; review note: ${s.reviewNote ? 'yes' : 'MISSING'}`);

// One-time purchase
const iap = await api('GET', `/v2/inAppPurchases/${IAP}`);
const a = iap.data.attributes;
console.log(`\nLIVE AI PURCHASE: ${a.name} (${a.productId}) type ${a.inAppPurchaseType}, state ${a.state}`);
const iapLoc = await tryApi('GET', `/v2/inAppPurchases/${IAP}/inAppPurchaseLocalizations`);
(iapLoc.data || []).forEach(l => console.log(`  ${l.attributes.locale}: "${l.attributes.name}" / "${l.attributes.description}"`));
const sched = await tryApi('GET', `/v2/inAppPurchases/${IAP}/iapPriceSchedule?include=baseTerritory,manualPrices`);
if (sched.data) {
  const pts = (sched.included || []).filter(x => x.type === 'inAppPurchasePrices');
  console.log(`  Base country: ${sched.data.relationships?.baseTerritory?.data?.id || '?'}; manual prices set: ${pts.length}`);
}
const iapAv = await tryApi('GET', `/v2/inAppPurchases/${IAP}/inAppPurchaseAvailability`);
let iapTerr = [];
if (iapAv.data) { iapTerr = await territories(`/v1/inAppPurchaseAvailabilities/${iapAv.data.id}/availableTerritories?limit=200`); show('Sold in', iapTerr); console.log(`  New countries added automatically: ${iapAv.data.attributes.availableInNewTerritories}`); }
else console.log('  Sold in: not set yet');
if (FIX && (iapTerr.join() !== ONLY.join() || iapAv.data?.attributes.availableInNewTerritories)) {
  await api('POST', '/v1/inAppPurchaseAvailabilities', { data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false },
    relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: IAP } }, availableTerritories: { data: ONLY.map(id => ({ type: 'territories', id })) } } } });
  console.log('  -> now sold in the United States only');
}
const iapShot = await tryApi('GET', `/v2/inAppPurchases/${IAP}/appStoreReviewScreenshot`);
console.log(`  Review screenshot: ${iapShot.data ? 'yes' : 'MISSING'}; review note: ${a.reviewNote ? 'yes' : 'MISSING'}`);

// Other in-app purchases on the app (e.g. an unused one)
const all = await tryApi('GET', `/v1/apps/${APP}/inAppPurchasesV2?limit=50`);
(all.data || []).forEach(x => console.log(`\nOTHER PURCHASE: ${x.attributes.name} (${x.attributes.productId}) state ${x.attributes.state}${x.id === IAP ? ' [Live AI]' : ''}`));
console.log(FIX ? '\nDone (fixes applied).' : '\nDone (report only).');
