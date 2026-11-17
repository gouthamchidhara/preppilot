// Local dev server: serves web/ and routes /api/* to the same handlers Azure Functions uses.
// No Azure Functions Core Tools needed.  Usage: npm run dev   (reads api/.env if present)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, 'api/.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { ROUTES } = await import('../api/src/lib/routes.js');
const { handleHealth } = await import('../api/src/lib/handlers.js');

const webRoot = resolve(root, 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const PORT = Number(process.env.PORT || 5173);

const readBody = req => new Promise(res => {
  let d = '';
  req.on('data', c => { d += c; if (d.length > 100000) req.destroy(); });
  req.on('end', () => { try { res(JSON.parse(d || 'null')); } catch { res(null); } });
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = { body: req.method === 'POST' ? await readBody(req) : null, headers: req.headers, ip: req.socket.remoteAddress };
      const route = url.pathname.slice(5);
      const handler = ROUTES[`${req.method} ${route}`];
      const out = handler ? await handler(r, console.warn) : { status: 404, body: { error: 'not found' }, headers: {} };
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...out.headers });
      return res.end(JSON.stringify(out.body));
    }
    let file = normalize(resolve(webRoot, '.' + decodeURIComponent(url.pathname)));
    if (!file.startsWith(webRoot + sep) && file !== webRoot) { res.writeHead(403); return res.end(); }
    if (!existsSync(file) || (await stat(file)).isDirectory()) file = resolve(webRoot, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('error');
  }
}).listen(PORT, () => console.log(`PrepPilot dev: http://localhost:${PORT}  (AI: ${handleHealth().body.ai})`));
