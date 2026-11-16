import { apiBase } from './config.js';
import { authHeaders, setAccount, signOut } from './auth.js';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function post(path, body) {
  const res = await fetch(apiBase() + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (data.account) setAccount(data.account);
  if (res.status === 401 && data.code === 'signin') signOut();
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  return data;
}

export const ai = {
  chat: (messages, { profileSummary, context, voice }) =>
    post('/api/chat', { messages, profileSummary, context, mode: voice ? 'voice' : 'chat' }).then(d => d.reply),
  generate: (topic, profileSummary, count = 8) => post('/api/generate', { topic, profileSummary, count }),
  health: () => fetch(apiBase() + '/api/health').then(r => r.json()),
  post,
};
