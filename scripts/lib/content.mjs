// Content integrity rules shared by the generator, `npm test` and CI.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const qHash = q => createHash('sha1').update(q).digest('hex').slice(0, 10);
const isStr = (v, min = 1, max = 1e5) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

// Rules for one topic. `strict` applies to AI-drafted topics (counts, tier mix); hand-written topics only need a valid shape.
export function validateTopic(t, { strict = false } = {}) {
  const errs = [];
  const at = m => errs.push(`${t?.id || '?'}: ${m}`);
  if (!t || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(t.id || '')) at('bad id');
  if (!isStr(t?.name, 2, 80)) at('name required');
  if (!Array.isArray(t?.concepts)) at('concepts must be an array');
  if (!Array.isArray(t?.qa)) at('qa must be an array');
  if (errs.length) return errs;
  t.concepts.forEach((c, i) => {
    if (!isStr(c.t, 2, 140) || !isStr(c.what, 20, 1500)) at(`concept ${i} needs t and what`);
    for (const k of ['why', 'ex', 'tip']) if (c[k] !== undefined && typeof c[k] !== 'string') at(`concept ${i} ${k} must be a string`);
  });
  t.qa.forEach((q, i) => {
    if (![1, 2, 3].includes(q.l)) at(`qa ${i} tier must be 1, 2 or 3`);
    if (!isStr(q.q, 8, 500) || !isStr(q.a, 20, 2000)) at(`qa ${i} needs q and a`);
  });
  const dupes = t.qa.map(q => q.q.trim().toLowerCase()).filter((q, i, a) => a.indexOf(q) !== i);
  if (dupes.length) at(`duplicate questions: ${dupes.slice(0, 2).join(' | ')}`);
  if (strict) {
    if (t.concepts.length < 6) at(`only ${t.concepts.length} concepts (need >= 6)`);
    if (t.qa.length < 12) at(`only ${t.qa.length} questions (need >= 12)`);
    const tiers = [1, 2, 3].map(l => t.qa.filter(q => q.l === l).length);
    if (tiers[0] < 3 || tiers[1] < 4 || tiers[2] < 3) at(`tier mix ${tiers.join('/')} (need >= 3/4/3)`);
    t.concepts.forEach((c, i) => { if (!isStr(c.ex, 10) || !isStr(c.why, 10) || !isStr(c.tip, 10)) at(`concept ${i} needs why, ex and tip`); });
  }
  return errs;
}

export function loadContent(root) {
  const dir = resolve(root, 'web/content/packs');
  const packs = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
  const catalog = JSON.parse(readFileSync(resolve(root, 'web/content/roles.json'), 'utf8'));
  const lockFile = resolve(root, 'content-src/content-lock.json');
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
  const index = existsSync(resolve(dir, 'index.json')) ? JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) : null;
  return { packs, catalog, lock, index };
}

export function validateAll({ packs, catalog, lock, index }) {
  const errs = [];
  const topics = new Map();
  for (const p of packs) {
    if (!p.id || !Array.isArray(p.topics)) { errs.push(`pack ${p.id || '?'}: bad shape`); continue; }
    for (const t of p.topics) {
      if (topics.has(t.id)) errs.push(`${t.id}: duplicate topic id (packs ${topics.get(t.id).pack} and ${p.id})`);
      topics.set(t.id, { ...t, pack: p.id });
      errs.push(...validateTopic(t, { strict: !!t.beta }));
      if (t.roles) errs.push(`${t.id}: relevance belongs in roles.json, not on the topic`);
    }
  }
  // Catalog: every referenced topic exists; every role is usable.
  const families = new Set((catalog.families || []).map(f => f.id));
  const roleIds = new Set();
  for (const r of catalog.roles || []) {
    if (roleIds.has(r.id)) errs.push(`role ${r.id}: duplicate`);
    roleIds.add(r.id);
    if (!families.has(r.family)) errs.push(`role ${r.id}: unknown family ${r.family}`);
    for (const id of [...Object.keys(r.topics || {}), ...(r.extras || [])]) if (!topics.has(id)) errs.push(`role ${r.id}: unknown topic ${id}`);
    for (const [id, w] of Object.entries(r.topics || {})) if (![1, 2, 3].includes(w)) errs.push(`role ${r.id}: weight for ${id} must be 1-3`);
    if (Object.keys(r.topics || {}).length < 8) errs.push(`role ${r.id}: needs >= 8 topics`);
    if (!r.topics?.behavioral) errs.push(`role ${r.id}: must include behavioral`);
  }
  // Append-only: published questions keep their index and text (progress is keyed by topicId-index).
  for (const [id, hashes] of Object.entries(lock)) {
    const t = topics.get(id);
    if (!t) { errs.push(`${id}: published topic was removed or renamed`); continue; }
    if (t.qa.length < hashes.length) errs.push(`${id}: questions were removed (${t.qa.length} < ${hashes.length})`);
    hashes.forEach((h, i) => { if (t.qa[i] && qHash(t.qa[i].q) !== h) errs.push(`${id}: question ${i} changed or moved`); });
  }
  if (index) {
    const listed = new Set(index.packs.flatMap(p => p.topics.map(t => t.id)));
    for (const id of topics.keys()) if (!listed.has(id)) errs.push(`${id}: missing from packs/index.json (run npm run content:index)`);
  }
  return { errors: errs, topics };
}

export function lockFrom(packs) {
  const lock = {};
  for (const p of packs) for (const t of p.topics) lock[t.id] = t.qa.map(q => qHash(q.q));
  return lock;
}
