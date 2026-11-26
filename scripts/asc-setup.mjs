// New App Store account setup, safe to rerun: each step checks first and only creates what is missing.
// 1. key, bundle ID (Sign in with Apple, push)  2. app record (made by a person in App Store Connect)
// 3. Pro subscription: group, product, text, USA only, $6.99, 3-day free trial
// 4. Live AI one-time purchase: product, text, USA only, $15.99
// 5. App: free, USA only
// Writes APP_ID, SUB_ID and IAP_ID to $GITHUB_ENV so the listing, screenshot and review uploaders run next.
import { createSign } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const BUNDLE = process.env.BUNDLE_ID || 'us.preppilot.app';
const PRO = { productId: 'pro_monthly', name: 'PrepPilot Pro Monthly', display: 'PrepPilot Pro', desc: 'Unlimited AI coach + 30 Live AI minutes a month', price: '6.99' };
const LIVE = { productId: 'mock_session_60min', name: 'Live AI 60 Minutes', display: 'Live AI, 60 minutes', desc: 'One 60-minute Live AI practice session', price: '15.99' };
const US = 'USA';

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
const step = async (label, fn) => { try { const r = await fn(); console.log(`✓ ${label}${r ? `: ${r}` : ''}`); return true; } catch (e) { console.log(`✗ ${label}: ${e.message}`); return false; } };
const rel = (name, type, id) => ({ [name]: { data: { type, id } } });
async function pricePoint(path, price) {
  let next = path;
  while (next) {
    const d = await api('GET', next.replace(API, ''));
    const p = d.data.find(x => x.attributes.customerPrice === price);
    if (p) return p.id;
    next = d.links?.next || null;
  }
  throw new Error(`no USA price point at $${price}`);
}

// 1-2. Bundle ID and app record
const bid = (await api('GET', `/v1/bundleIds?filter[identifier]=${BUNDLE}`)).data.find(b => b.attributes.identifier === BUNDLE);
if (!bid) throw new Error(`Bundle ID ${BUNDLE} is missing; run the first setup step.`);
const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
if (!app) { console.log(`No app record for ${BUNDLE} yet. Create it in App Store Connect > Apps > + > New App.`); process.exit(0); }
console.log(`App: ${app.attributes.name} (id ${app.id})`);

// 3. Pro subscription
let group = (await api('GET', `/v1/apps/${app.id}/subscriptionGroups?limit=20`)).data[0];
if (!group) await step('Subscription group "PrepPilot Pro"', async () => { group = (await api('POST', '/v1/subscriptionGroups', { data: { type: 'subscriptionGroups', attributes: { referenceName: 'PrepPilot Pro' }, relationships: rel('app', 'apps', app.id) } })).data; });
const gl = (await api('GET', `/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`)).data;
if (!gl.length) await step('Group display name (en-US)', () => api('POST', '/v1/subscriptionGroupLocalizations', { data: { type: 'subscriptionGroupLocalizations', attributes: { locale: 'en-US', name: 'PrepPilot Pro', customAppName: 'PrepPilot' }, relationships: rel('subscriptionGroup', 'subscriptionGroups', group.id) } }));
let sub = (await api('GET', `/v1/subscriptionGroups/${group.id}/subscriptions?limit=20`)).data.find(s => s.attributes.productId === PRO.productId);
if (!sub) await step(`Subscription ${PRO.productId}`, async () => { sub = (await api('POST', '/v1/subscriptions', { data: { type: 'subscriptions', attributes: { name: PRO.name, productId: PRO.productId, subscriptionPeriod: 'ONE_MONTH', familySharable: false, groupLevel: 1 }, relationships: rel('group', 'subscriptionGroups', group.id) } })).data; });
if (sub) {
  const sl = (await api('GET', `/v1/subscriptions/${sub.id}/subscriptionLocalizations`)).data;
  if (!sl.length) await step('Pro name and description (en-US)', () => api('POST', '/v1/subscriptionLocalizations', { data: { type: 'subscriptionLocalizations', attributes: { locale: 'en-US', name: PRO.display, description: PRO.desc }, relationships: rel('subscription', 'subscriptions', sub.id) } }));
  await step('Pro sold in the USA only', () => api('POST', '/v1/subscriptionAvailabilities', { data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { ...rel('subscription', 'subscriptions', sub.id), availableTerritories: { data: [{ type: 'territories', id: US }] } } } }));
  const cur = await api('GET', `/v1/subscriptions/${sub.id}/prices?filter[territory]=${US}&include=subscriptionPricePoint&limit=20`).catch(() => ({ included: [] }));
  if (!(cur.included || []).some(x => x.attributes?.customerPrice === PRO.price)) {
    await step(`Pro price $${PRO.price}`, async () => { const pp = await pricePoint(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=${US}&limit=200`, PRO.price);
      await api('POST', '/v1/subscriptionPrices', { data: { type: 'subscriptionPrices', attributes: { startDate: null, preserveCurrentPrice: false }, relationships: { ...rel('subscription', 'subscriptions', sub.id), ...rel('subscriptionPricePoint', 'subscriptionPricePoints', pp) } } }); });
  } else console.log(`✓ Pro price $${PRO.price} (already set)`);
  const offers = (await api('GET', `/v1/subscriptions/${sub.id}/introductoryOffers?limit=20`)).data;
  if (!offers.some(o => o.attributes.offerMode === 'FREE_TRIAL')) await step('3-day free trial (USA)', () => api('POST', '/v1/subscriptionIntroductoryOffers', { data: { type: 'subscriptionIntroductoryOffers',
    attributes: { duration: 'THREE_DAYS', offerMode: 'FREE_TRIAL', numberOfPeriods: 1, startDate: null }, relationships: { ...rel('subscription', 'subscriptions', sub.id), ...rel('territory', 'territories', US) } } }));
}

// 4. Live AI one-time purchase
let iap = (await api('GET', `/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data.find(x => x.attributes.productId === LIVE.productId);
if (!iap) await step(`One-time purchase ${LIVE.productId}`, async () => { iap = (await api('POST', '/v2/inAppPurchases', { data: { type: 'inAppPurchases', attributes: { name: LIVE.name, productId: LIVE.productId, inAppPurchaseType: 'CONSUMABLE', familySharable: false }, relationships: rel('app', 'apps', app.id) } })).data; });
if (iap) {
  const il = (await api('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`)).data;
  if (!il.length) await step('Live AI name and description (en-US)', () => api('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations', attributes: { locale: 'en-US', name: LIVE.display, description: LIVE.desc }, relationships: rel('inAppPurchaseV2', 'inAppPurchases', iap.id) } }));
  await step('Live AI sold in the USA only', () => api('POST', '/v1/inAppPurchaseAvailabilities', { data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { ...rel('inAppPurchase', 'inAppPurchases', iap.id), availableTerritories: { data: [{ type: 'territories', id: US }] } } } }));
  const sched = await api('GET', `/v2/inAppPurchases/${iap.id}/iapPriceSchedule`).catch(() => ({ data: null }));
  if (!sched.data) await step(`Live AI price $${LIVE.price}`, async () => { const pp = await pricePoint(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${US}&limit=200`, LIVE.price);
    await api('POST', '/v1/inAppPurchasePriceSchedules', { data: { type: 'inAppPurchasePriceSchedules', relationships: { ...rel('inAppPurchase', 'inAppPurchases', iap.id), ...rel('baseTerritory', 'territories', US), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] } } },
      included: [{ type: 'inAppPurchasePrices', id: '${price1}', attributes: { startDate: null }, relationships: rel('inAppPurchasePricePoint', 'inAppPurchasePricePoints', pp) }] }); });
  else console.log('✓ Live AI price (already set)');
}

// 5. App: free, USA only
const appPrice = await api('GET', `/v1/apps/${app.id}/appPriceSchedule`).catch(() => ({ data: null }));
if (!appPrice.data) await step('App price: free', async () => { const pp = await pricePoint(`/v1/apps/${app.id}/appPricePoints?filter[territory]=${US}&limit=200`, '0.0').catch(() => pricePoint(`/v1/apps/${app.id}/appPricePoints?filter[territory]=${US}&limit=200`, '0.00'));
  await api('POST', '/v1/appPriceSchedules', { data: { type: 'appPriceSchedules', relationships: { ...rel('app', 'apps', app.id), ...rel('baseTerritory', 'territories', US), manualPrices: { data: [{ type: 'appPrices', id: '${p0}' }] } } },
    included: [{ type: 'appPrices', id: '${p0}', attributes: { startDate: null }, relationships: rel('appPricePoint', 'appPricePoints', pp) }] }); });
else console.log('✓ App price (already set)');
const av = await api('GET', `/v1/apps/${app.id}/appAvailabilityV2`).catch(() => ({ data: null }));
if (!av.data) await step('App sold in the USA only', () => api('POST', '/v2/appAvailabilities', { data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: false },
  relationships: { ...rel('app', 'apps', app.id), territoryAvailabilities: { data: [{ type: 'territoryAvailabilities', id: '${us}' }] } } },
  included: [{ type: 'territoryAvailabilities', id: '${us}', attributes: { available: true }, relationships: rel('territory', 'territories', US) }] }));
else console.log('✓ App availability (already set; check it is USA only in Pricing and Availability)');

if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `APP_ID=${app.id}\nSUB_ID=${sub?.id || ''}\nIAP_ID=${iap?.id || ''}\n`);
console.log(`IDs: app ${app.id}, Pro ${sub?.id}, Live AI ${iap?.id}`);
