// Sign-in. Web: Google Identity Services button. Inside the Expo app: native Google / Apple sign-in
// via the WebView bridge (Google blocks its web sign-in inside embedded web views).
import { apiBase } from './config.js';
import { store } from './store.js';

export const native = () => !!window.ReactNativeWebView;
const toNative = msg => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));

export function authHeaders() {
  const h = { 'x-client-id': store.clientId() };
  const t = store.session();
  // Azure SWA overwrites `authorization` with its own platform JWT before it reaches the
  // Functions handler, so the session token must travel in a custom header.
  if (t) h['x-session-token'] = t;
  const code = store.accessCode();
  if (code) h['x-access-code'] = code;
  return h;
}

export const signedIn = () => !!store.session() || !!store.accessCode();

let onChange = () => {};
export function onAccountChange(fn) { onChange = fn; }

// In the app, tell the native side who is signed in as soon as we know, so the store account is
// ready before anyone taps Buy (that lookup used to add a second or two to the purchase sheet).
let identified = '';
export function setAccount(a) {
  if (!a) return;
  store.setAccount(a); onChange(a);
  if (a.key && a.key !== identified && window.ReactNativeWebView) { identified = a.key; toNative({ type: 'identify', userKey: a.key }); }
}

async function exchange(provider, idToken, name) {
  const res = await fetch(`${apiBase()}/api/auth/${provider}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Sign-in failed');
  store.setLastProvider(provider);
  store.setSession(data.token);
  setAccount(data.account);
  return data.account;
}

export async function refreshAccount() {
  if (!store.session()) return null;
  const res = await fetch(`${apiBase()}/api/me`, { headers: authHeaders() });
  if (res.status === 401) { signOut(); return null; }
  const a = await res.json().catch(() => null);
  if (res.ok) setAccount(a);
  return a;
}

export function signOut() {
  store.setSession(''); store.setAccount(null);
  try { window.google?.accounts.id.disableAutoSelect(); } catch { /* not loaded */ }
  toNative({ type: 'signout' });
  onChange(null);
}

/* ---------- web: Google Identity Services ---------- */
let gisLoaded;
let gisInit;
function loadGis() {
  gisLoaded ||= new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = res; s.onerror = () => rej(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

export async function renderGoogleButton(el, clientId, onError) {
  if (!el || !clientId) return;
  await loadGis();
  if (!gisInit) {
    gisInit = true;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: r => exchange('google', r.credential).catch(e => onError?.(e.message)),
      ux_mode: 'popup',
      auto_select: false,
    });
  }
  if (!el.childElementCount) window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
}

/* ---------- native app bridge ---------- */
export function nativeSignIn(provider) { toNative({ type: 'signin', provider }); }
export function nativePurchase(userKey) { toNative({ type: 'purchase', userKey }); }
export function nativeBuyLive(userKey) { toNative({ type: 'buyLive', userKey }); }
export function nativeRestore(userKey) { toNative({ type: 'restore', userKey }); }
// Badge + daily reminder: no-ops on the web (no WebView bridge there).
export function notifyBadge(count) { toNative({ type: 'badge', count }); }
export function notifyDaily(title, body) { toNative({ type: 'daily', title, body }); }
export function notifyWeek(items) { toNative({ type: 'week', items }); }
export function promptNotifications() { toNative({ type: 'promptNotifications' }); }

export function listenNative({ onError, onPurchased, onCancelled }) {
  window.addEventListener('pp-native', async e => {
    const m = e.detail || {};
    try {
      if (m.type === 'auth') await exchange(m.provider, m.idToken, m.name);
      else if (m.type === 'purchased') {
        const res = await fetch(`${apiBase()}/api/billing/refresh`, { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: '{}' });
        const d = await res.json().catch(() => ({}));
        if (d.account) setAccount(d.account);
        onPurchased?.(d.account);
      } else if (m.type === 'cancelled') onCancelled?.();
      else if (m.type === 'error') onError?.(m.message);
    } catch (err) { onError?.(err.message); }
  });
}
