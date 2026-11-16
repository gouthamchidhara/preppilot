import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContent, validateAll, validateTopic, qHash } from '../scripts/lib/content.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const content = loadContent(root);
const sanitizeFile = new URL('../private/sanitize.json', import.meta.url);

test('all packs, the role catalog, the index and the append-only lock are consistent', () => {
  assert.deepEqual(validateAll(content).errors, []);
});

test('every listed role gets a substantial guide', () => {
  const { topics } = validateAll(content);
  for (const r of content.catalog.roles) {
    const qs = Object.keys(r.topics).reduce((n, id) => n + topics.get(id).qa.length, 0);
    assert.ok(qs >= 120, `${r.id} has only ${qs} questions`);
  }
});

test('validator catches renamed topics, shrunk or reordered questions and unknown catalog topics', () => {
  const pack = { id: 'p', topics: [{ id: 'aa', name: 'A', concepts: [], qa: [{ l: 1, q: 'first question?', a: 'an answer long enough' }, { l: 2, q: 'second question?', a: 'an answer long enough' }] }] };
  const catalog = { families: [{ id: 'f' }], roles: [{ id: 'r', family: 'f', topics: { aa: 3, behavioral: 3, nope: 1 } }] };
  const lock = { aa: [qHash('second question?'), qHash('first question?')], gone: ['x'] };
  const errs = validateAll({ packs: [pack], catalog, lock, index: null }).errors.join('\n');
  assert.match(errs, /gone: published topic was removed/);
  assert.match(errs, /aa: question 0 changed or moved/);
  assert.match(errs, /unknown topic nope/);
  assert.match(errs, /needs >= 8 topics/);
});

test('AI-drafted (beta) topics must meet the quality bar', () => {
  const thin = { id: 'x1', name: 'Xx', beta: true, concepts: [{ t: 'T', what: 'w'.repeat(30) }], qa: [{ l: 1, q: 'a question?', a: 'an answer long enough' }] };
  const errs = validateTopic(thin, { strict: true }).join('\n');
  assert.match(errs, /concepts/);
  assert.match(errs, /questions/);
  assert.match(errs, /tier mix/);
});

test('personal topics never ship in web/', () => {
  const ids = content.packs.flatMap(p => p.topics.map(t => t.id));
  assert.ok(!ids.some(id => ['myproject', 'story', 'reality'].includes(id)));
  assert.ok(!readdirSync(new URL('../web/content/packs/', import.meta.url)).includes('personal.json'));
});

test('multi-role profiles request topics for every selected role and other-role base', async () => {
  const { initContent, topicIdsFor } = await import('../web/js/content.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => ({
    ok: true,
    json: async () => JSON.parse(readFileSync(new URL(`../web/${url}`, import.meta.url), 'utf8')),
  });
  try {
    await initContent();
    const java = topicIdsFor({ roleIds: ['backend-java'] });
    const python = topicIdsFor({ roleIds: ['backend-python'] });
    const infra = topicIdsFor({ roleIds: ['other'], baseRoleId: 'infra' });
    const combined = topicIdsFor({ roleIds: ['backend-java', 'backend-python', 'other'], baseRoleId: 'infra' });
    for (const id of [...java, ...python, ...infra]) assert.ok(combined.has(id), `${id} missing`);
    assert.ok(combined.has('java-core'));
    assert.ok(combined.has('python-core'));
    assert.ok(combined.has('linux'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Leak rules name real employers/projects, so they live only in the git-ignored private file.
// They apply to packs built from the personal source guide; AI packs are drafted from public outlines only
// (and legitimately contain strings like "WCAG AA").
const PERSONAL_SOURCE_PACKS = ['infra', 'behavioral'];
test('no personal references in packs built from the personal guide (needs private/sanitize.json)', { skip: !existsSync(sanitizeFile) }, () => {
  const { leak, leakCased } = JSON.parse(readFileSync(sanitizeFile, 'utf8'));
  for (const p of content.packs.filter(x => PERSONAL_SOURCE_PACKS.includes(x.id))) {
    const s = JSON.stringify(p);
    const m = s.match(new RegExp(leak, 'i')) || (leakCased && s.match(new RegExp(leakCased)));
    assert.equal(m, null, `${p.id}: found "${m?.[0]}"`);
  }
});
