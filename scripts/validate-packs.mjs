// Validates all content; with --lock, records the published state (run only after validation passes).
// Usage: node scripts/validate-packs.mjs [--lock]
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, validateAll, lockFrom } from './lib/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent(root);
const { errors, topics } = validateAll(content);
if (errors.length) {
  console.error(`${errors.length} problem(s):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${content.packs.length} packs, ${topics.size} topics, ${content.catalog.roles.length} roles`);
if (process.argv.includes('--lock')) {
  // Merge: a lock entry can only grow, never shrink.
  const next = lockFrom(content.packs);
  for (const [id, hashes] of Object.entries(content.lock)) if ((next[id]?.length || 0) < hashes.length) next[id] = hashes;
  writeFileSync(resolve(root, 'content-src/content-lock.json'), JSON.stringify(next, null, 1));
  console.log('content-lock.json updated');
}
