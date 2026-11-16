// RevenueCat: one entitlement ("pro") across Apple, Google and (later) web purchases.
// The app logs in to RevenueCat with our user key, so app_user_id === our user key.
import { timingSafeEqual } from 'node:crypto';
import { setProUntil } from './account.js';

const ENTITLEMENT = () => process.env.REVENUECAT_ENTITLEMENT || 'pro';
const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);

export function webhookAuthorized(header) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function applyWebhook(body, now = Date.now()) {
  const e = body?.event;
  if (!e || e.type === 'TEST') return { ignored: true };
  if (Array.isArray(e.entitlement_ids) && !e.entitlement_ids.includes(ENTITLEMENT())) return { ignored: true };
  const keys = [...new Set([e.app_user_id, e.original_app_user_id, ...(e.aliases || [])].filter(k => typeof k === 'string' && k.includes(':')))];
  if (!keys.length) return { ignored: true };
  const until = Number(e.expiration_at_ms) || 0;
  if (GRANT.has(e.type) && until > now) {
    for (const k of keys) await setProUntil(k, until, now);
    return { granted: keys, until };
  }
  if (e.type === 'EXPIRATION') {
    for (const k of keys) await setProUntil(k, Math.min(until || now, now), now);
    return { revoked: keys };
  }
  return { ignored: true }; // CANCELLATION / BILLING_ISSUE: access stays until expiration
}

export async function refreshFromRevenueCat(key, now = Date.now()) {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret) return { configured: false };
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error(`RevenueCat ${res.status}`), { status: 502 });
  const ent = (await res.json())?.subscriber?.entitlements?.[ENTITLEMENT()];
  if (!ent) return { configured: true, pro: false };
  const until = ent.expires_date ? Date.parse(ent.expires_date) : now + 3650 * 86400000;
  await setProUntil(key, until, now);
  return { configured: true, pro: until > now, until };
}
