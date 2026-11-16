import { apiBase } from './config.js';
import { store } from './store.js';

async function post(path, body) {
  const res = await fetch(apiBase() + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': store.clientId(), 'x-access-code': store.accessCode() || '' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const ai = {
  chat: (messages, { profileSummary, context, voice }) =>
    post('/api/chat', { messages, profileSummary, context, mode: voice ? 'voice' : 'chat' }).then(d => d.reply),
  generate: (topic, profileSummary, count = 8) => post('/api/generate', { topic, profileSummary, count }),
  health: () => fetch(apiBase() + '/api/health').then(r => r.json()),
};
