// Builds web/content/packs/index.json (pack list, topic names, cache-busting versions).
// Usage: node scripts/build-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'web/content/packs');
const packs = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort().map(f => {
  const raw = readFileSync(resolve(dir, f), 'utf8');
  const p = JSON.parse(raw);
  return {
    id: p.id,
    name: p.name,
    version: createHash('sha1').update(raw).digest('hex').slice(0, 10),
    bytes: Buffer.byteLength(raw),
    topics: p.topics.map(t => ({ id: t.id, name: t.name, blurb: t.blurb || '', ...(t.beta ? { beta: true } : {}) })),
  };
});
writeFileSync(resolve(dir, 'index.json'), JSON.stringify({ version: 1, packs }, null, 1));
console.log(`index.json: ${packs.length} packs, ${packs.reduce((a, p) => a + p.topics.length, 0)} topics`);
