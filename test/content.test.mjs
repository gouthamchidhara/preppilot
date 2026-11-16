import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../web/content/packs/infra.json', import.meta.url), 'utf8'));
const sanitizeFile = new URL('../private/sanitize.json', import.meta.url);

test('public pack is well-formed with unique topic ids', () => {
  const ids = pack.topics.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of pack.topics) {
    assert.ok(t.name && t.roles, `${t.id} missing name/roles`);
    for (const q of t.qa) assert.ok([1, 2, 3].includes(q.l) && q.q && q.a, `${t.id} bad qa`);
  }
});

test('personal topics and packs never ship in web/', () => {
  assert.ok(!pack.topics.some(t => ['myproject', 'story', 'reality'].includes(t.id)));
  assert.ok(!readdirSync(new URL('../web/content/packs/', import.meta.url)).includes('personal.json'));
});

// Leak rules name real employers/projects, so they live only in the git-ignored private file.
test('no personal references in the public pack (needs private/sanitize.json)', { skip: !existsSync(sanitizeFile) }, () => {
  const { leak, leakCased } = JSON.parse(readFileSync(sanitizeFile, 'utf8'));
  const s = JSON.stringify(pack);
  const m = s.match(new RegExp(leak, 'i')) || (leakCased && s.match(new RegExp(leakCased)));
  assert.equal(m, null, `found "${m?.[0]}"`);
});
