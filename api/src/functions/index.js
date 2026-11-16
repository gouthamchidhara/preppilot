import { app } from '@azure/functions';
import { handleChat, handleGenerate, handleHealth, handleRealtime } from '../lib/handlers.js';

const toReq = async request => {
  let body = null;
  try { body = await request.json(); } catch { /* empty or invalid body -> validation returns 400 */ }
  return { body, headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])), ip: '' };
};
const toRes = r => ({ status: r.status, jsonBody: r.body, headers: { 'cache-control': 'no-store', ...r.headers } });

app.http('chat', {
  methods: ['POST'], authLevel: 'anonymous', route: 'chat',
  handler: async (request, ctx) => toRes(await handleChat(await toReq(request), m => ctx.warn(m))),
});

app.http('generate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'generate',
  handler: async (request, ctx) => toRes(await handleGenerate(await toReq(request), m => ctx.warn(m))),
});

app.http('realtime', {
  methods: ['POST'], authLevel: 'anonymous', route: 'realtime',
  handler: async (request, ctx) => toRes(await handleRealtime(await toReq(request), m => ctx.warn(m))),
});

app.http('health', {
  methods: ['GET'], authLevel: 'anonymous', route: 'health',
  handler: async () => toRes(handleHealth()),
});
