// Sign-in: verify Google / Apple ID tokens (RS256 against their published JWKS), then issue our own
// HMAC-signed session token. No third-party auth SDK needed.
import { createHmac, createPublicKey, verify as rsaVerify, timingSafeEqual, randomBytes } from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64url');
const fromB64u = s => Buffer.from(s, 'base64url');

const PROVIDERS = {
  google: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audiences: () => (process.env.GOOGLE_CLIENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  },
  apple: {
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: () => (process.env.APPLE_AUDIENCES || 'com.gchid.preppilot').split(',').map(s => s.trim()).filter(Boolean),
  },
};

const jwksCache = new Map(); // url -> { keys, until }
let fetchJwks = async url => {
  const hit = jwksCache.get(url);
  if (hit && hit.until > Date.now()) return hit.keys;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`JWKS fetch failed ${res.status}`);
  const { keys } = await res.json();
  jwksCache.set(url, { keys, until: Date.now() + 3600000 });
  return keys;
};
export function setJwksFetcher(fn) { fetchJwks = fn; jwksCache.clear(); }

function decode(token) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('malformed token');
  return { header: JSON.parse(fromB64u(parts[0])), payload: JSON.parse(fromB64u(parts[1])), signed: `${parts[0]}.${parts[1]}`, sig: fromB64u(parts[2]) };
}

export async function verifyIdToken(provider, token, now = Date.now()) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('unknown provider');
  const audiences = p.audiences();
  if (!audiences.length) throw Object.assign(new Error(`${provider} sign-in is not configured`), { status: 503 });
  const { header, payload, signed, sig } = decode(token);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');
  const jwk = (await fetchJwks(p.jwks)).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const ok = rsaVerify('RSA-SHA256', Buffer.from(signed), createPublicKey({ key: jwk, format: 'jwk' }), sig);
  if (!ok) throw new Error('bad signature');
  if (!p.issuers.includes(payload.iss)) throw new Error('bad issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some(a => audiences.includes(a))) throw new Error('token not issued for this app');
  if (!payload.exp || payload.exp * 1000 < now - 60000) throw new Error('token expired');
  if (provider === 'google' && payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('email not verified');
  return { key: `${provider}:${payload.sub}`, provider, email: (payload.email || '').toLowerCase(), name: payload.name || '' };
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // Dev/test only: random per process (sessions reset on restart).
  secret.dev ||= randomBytes(32).toString('hex');
  return secret.dev;
}

const SESSION_DAYS = 30;
export function signSession({ key, email }, now = Date.now()) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ sub: key, email, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 }));
  const sig = b64u(createHmac('sha256', secret()).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifySession(token, now = Date.now()) {
  try {
    const [h, b, s] = token.split('.');
    const expected = createHmac('sha256', secret()).update(`${h}.${b}`).digest();
    const got = fromB64u(s);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const p = JSON.parse(fromB64u(b));
    if (!p.exp || p.exp * 1000 < now) return null;
    return { key: p.sub, email: p.email };
  } catch { return null; }
}

// Identity for a request: our session token, or the legacy beta ACCESS_CODE (treated as admin).
export function identify(headers) {
  const auth = headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const s = verifySession(auth.slice(7));
    if (s) return s;
  }
  const code = process.env.ACCESS_CODE;
  const given = headers['x-access-code'];
  if (code && typeof given === 'string' && given.length === code.length && timingSafeEqual(Buffer.from(given), Buffer.from(code))) {
    return { key: 'code:admin', email: '', viaCode: true };
  }
  return null;
}
