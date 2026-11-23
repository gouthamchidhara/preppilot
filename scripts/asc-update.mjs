// One-off App Store Connect update, run by .github/workflows/asc-update.yml with the key stored
// in GitHub secrets: Pro price $6.99 (USA), description "30 Live AI minutes", 3-day free trial.
// Prints what it changed; never prints the key or the token.
import { createSign } from 'node:crypto';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
if (!kid || !iss || !p8) { console.error('Missing ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 secret.'); process.exit(1); }
const SUB = process.env.SUB_ID || '6835597421';
const PRICE = process.env.PRICE || '6.99';
const DESC = process.env.DESC || 'Unlimited AI coach + 30 Live AI minutes a month';
const DRY = process.env.DRY === '1';

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

const sub = await api('GET', `/v1/subscriptions/${SUB}`);
console.log(`Subscription: ${sub.data.attributes.name} (${sub.data.attributes.productId}), state ${sub.data.attributes.state}`);

// 1. Description shown on the App Store
const locs = await api('GET', `/v1/subscriptions/${SUB}/subscriptionLocalizations`);
for (const l of locs.data) {
  console.log(`Localization ${l.attributes.locale}: "${l.attributes.description}"`);
  if (l.attributes.description !== DESC && !DRY) {
    await api('PATCH', `/v1/subscriptionLocalizations/${l.id}`, { data: { type: 'subscriptionLocalizations', id: l.id, attributes: { description: DESC } } });
    console.log(`  -> description set to "${DESC}"`);
  }
}

// 2. Price in the USA (the app is sold in the USA only)
let next = `/v1/subscriptions/${SUB}/pricePoints?filter[territory]=USA&limit=200`, point = null;
while (next && !point) {
  const pp = await api('GET', next.replace(API, ''));
  point = pp.data.find(p => p.attributes.customerPrice === PRICE);
  next = pp.links?.next || null;
}
if (!point) throw new Error(`No USA price point at $${PRICE}`);
const cur = await api('GET', `/v1/subscriptions/${SUB}/prices?filter[territory]=USA&include=subscriptionPricePoint&limit=50`);
const curPrices = (cur.included || []).filter(x => x.type === 'subscriptionPricePoints').map(x => x.attributes.customerPrice);
console.log(`Current USA price points: ${curPrices.join(', ') || 'none'}; target $${PRICE}`);
if (!DRY && !curPrices.includes(PRICE)) {
  await api('POST', '/v1/subscriptionPrices', { data: { type: 'subscriptionPrices', attributes: { startDate: null, preserveCurrentPrice: false },
    relationships: { subscription: { data: { type: 'subscriptions', id: SUB } }, subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: point.id } } } } });
  console.log(`  -> USA price set to $${PRICE}`);
}

// 3. Three-day free trial for new subscribers in the USA
const offers = await api('GET', `/v1/subscriptions/${SUB}/introductoryOffers?limit=50`);
const have = offers.data.map(o => `${o.attributes.offerMode} ${o.attributes.duration}`);
console.log(`Introductory offers now: ${have.join(', ') || 'none'}`);
if (!have.includes('FREE_TRIAL THREE_DAYS') && !DRY) {
  await api('POST', '/v1/subscriptionIntroductoryOffers', { data: { type: 'subscriptionIntroductoryOffers',
    attributes: { duration: 'THREE_DAYS', offerMode: 'FREE_TRIAL', numberOfPeriods: 1, startDate: null },
    relationships: { subscription: { data: { type: 'subscriptions', id: SUB } }, territory: { data: { type: 'territories', id: 'USA' } } } } });
  console.log('  -> 3-day free trial added (USA)');
}
console.log(DRY ? 'Dry run: nothing changed.' : 'Done.');
