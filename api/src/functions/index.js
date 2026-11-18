import { app } from '@azure/functions';
import { ROUTES } from '../lib/routes.js';

const toReq = async request => {
  let body = null;
  if (request.method === 'POST') {
    try { body = await request.json(); } catch { /* empty or invalid body -> handler validation returns 400 */ }
  }
  return { body, headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])), query: Object.fromEntries(request.query || []), ip: '' };
};
const toRes = r => ({ status: r.status, jsonBody: r.body, headers: { 'cache-control': 'no-store', ...r.headers } });

for (const [key, handler] of Object.entries(ROUTES)) {
  const [method, route] = key.split(' ');
  app.http(route.replace(/\//g, '-'), {
    methods: [method], authLevel: 'anonymous', route,
    handler: async (request, ctx) => toRes(await handler(await toReq(request), m => ctx.warn(m))),
  });
}
