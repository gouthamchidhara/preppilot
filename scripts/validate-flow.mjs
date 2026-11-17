// Checks web/content/flow/<pack>.json and web/content/meaning/<pack>.json against the packs and diagram specs.
//   node scripts/validate-flow.mjs            all packs that have files
//   node scripts/validate-flow.mjs infra      one pack
// flow:    { "<topicId>": { "order": [concept indexes], "hooks": [one per step to the next card], "upNext": "...", "basics": [concept indexes] } }
// meaning: { "<topicId>": { "analogy": { "name": "...", "line": "..." }, "caption": "...", "steps": ["..."] } }
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { SPECS } from '../web/js/diagram-data.js';

const root = new URL('../web/content/', import.meta.url);
const only = process.argv[2];
const packs = JSON.parse(readFileSync(new URL('packs/index.json', root))).packs.map(p => p.id).filter(id => !only || id === only);
const errs = [];
let checked = 0;
for (const pack of packs) {
  const topics = JSON.parse(readFileSync(new URL(`packs/${pack}.json`, root))).topics;
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const flowFile = new URL(`flow/${pack}.json`, root), meanFile = new URL(`meaning/${pack}.json`, root);
  if (existsSync(flowFile)) {
    const flow = JSON.parse(readFileSync(flowFile));
    for (const t of topics) if (!flow[t.id]) errs.push(`flow/${pack}: missing topic ${t.id}`);
    for (const [id, f] of Object.entries(flow)) {
      const t = byId[id]; if (!t) { errs.push(`flow/${pack}: unknown topic ${id}`); continue; }
      const n = t.concepts.length; checked++;
      const sorted = [...(f.order || [])].sort((a, b) => a - b);
      if (sorted.length !== n || sorted.some((v, i) => v !== i)) errs.push(`flow/${pack}/${id}: order must list each of 0..${n - 1} exactly once`);
      if (!Array.isArray(f.hooks) || f.hooks.length !== Math.max(0, n - 1)) errs.push(`flow/${pack}/${id}: hooks must have ${n - 1} entries (one per move to the next card)`);
      (f.hooks || []).forEach((h, i) => { if (typeof h !== 'string' || h.length < 15 || h.length > 140) errs.push(`flow/${pack}/${id}: hook ${i} must be 15-140 chars`); });
      if (typeof f.upNext !== 'string' || f.upNext.length < 15 || f.upNext.length > 160) errs.push(`flow/${pack}/${id}: upNext must be 15-160 chars`);
      if (!Array.isArray(f.basics) || f.basics.some(i => !Number.isInteger(i) || i < 0 || i >= n)) errs.push(`flow/${pack}/${id}: basics must be concept indexes`);
    }
  }
  if (existsSync(meanFile)) {
    const mean = JSON.parse(readFileSync(meanFile));
    for (const t of topics) if (SPECS[t.id] && !mean[t.id]) errs.push(`meaning/${pack}: missing topic ${t.id}`);
    for (const [id, m] of Object.entries(mean)) {
      const spec = SPECS[id]; if (!spec) { errs.push(`meaning/${pack}: no diagram spec for ${id}`); continue; }
      checked++;
      if (!m.analogy?.name || m.analogy.name.length > 40) errs.push(`meaning/${pack}/${id}: analogy.name required, max 40 chars`);
      if (!m.analogy?.line || m.analogy.line.length < 30 || m.analogy.line.length > 220) errs.push(`meaning/${pack}/${id}: analogy.line 30-220 chars`);
      if (typeof m.caption !== 'string' || m.caption.length < 20 || m.caption.length > 260) errs.push(`meaning/${pack}/${id}: caption 20-260 chars`);
      if (!Array.isArray(m.steps) || m.steps.length !== spec.steps.length) errs.push(`meaning/${pack}/${id}: steps must have exactly ${spec.steps.length} entries (one per diagram stage)`);
      (m.steps || []).forEach((s, i) => { if (typeof s !== 'string' || s.length < 20 || s.length > 240) errs.push(`meaning/${pack}/${id}: step ${i} 20-240 chars`); });
    }
  }
}
for (const f of [...readdirSync(new URL('flow/', root)), ...readdirSync(new URL('meaning/', root))]) if (!f.endsWith('.json')) errs.push(`stray file ${f}`);
console.log(errs.length ? errs.join('\n') : `ok (${checked} topic entries checked)`);
process.exit(errs.length ? 1 : 0);
