// Checks web/content/field/<pack>.json: terminology, troubleshooting and field-scenario cards per topic.
//   node scripts/validate-field.mjs [pack]
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../web/content/', import.meta.url);
const only = process.argv[2];
const packs = JSON.parse(readFileSync(new URL('packs/index.json', root))).packs.map(p => p.id).filter(id => !only || id === only);
const want = { terms: [4, 6], trouble: [3, 5], scenarios: [2, 4] };
const errs = []; let n = 0;
for (const pack of packs) {
  const f = new URL(`field/${pack}.json`, root);
  if (!existsSync(f)) { if (only) errs.push(`field/${pack}.json missing`); continue; }
  const topics = JSON.parse(readFileSync(new URL(`packs/${pack}.json`, root))).topics;
  const data = JSON.parse(readFileSync(f));
  for (const t of topics) if (!data[t.id]) errs.push(`field/${pack}: missing topic ${t.id}`);
  const seen = new Set();
  for (const [id, d] of Object.entries(data)) {
    if (!topics.some(t => t.id === id)) { errs.push(`field/${pack}: unknown topic ${id}`); continue; }
    for (const [k, [lo, hi]] of Object.entries(want)) {
      const list = d[k];
      if (!Array.isArray(list) || list.length < lo || list.length > hi) { errs.push(`field/${pack}/${id}: ${k} needs ${lo}-${hi} cards`); continue; }
      list.forEach((c, i) => {
        n++;
        if (typeof c?.q !== 'string' || c.q.length < 8 || c.q.length > 200) errs.push(`field/${pack}/${id}/${k}[${i}]: q 8-200 chars`);
        if (typeof c?.a !== 'string' || c.a.length < 20 || c.a.length > 420) errs.push(`field/${pack}/${id}/${k}[${i}]: a 20-420 chars`);
        if (seen.has(c?.q)) errs.push(`field/${pack}/${id}: duplicate question "${c?.q}"`);
        seen.add(c?.q);
      });
    }
  }
}
console.log(errs.length ? errs.join('\n') : `ok (${n} cards)`);
process.exit(errs.length ? 1 : 0);
