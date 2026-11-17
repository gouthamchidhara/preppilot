import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// A removed export that app.js still imports breaks the whole app at load
// (the browser refuses the module and the page sits on "Loading…") while
// every other test still passes — so check import resolution here.
const dir = new URL('../web/js/', import.meta.url);

function exportsOf(src) {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const n of m[1].split(',')) out.add(n.trim().split(/\s+as\s+/).pop());
  }
  return out;
}

test('every named import in web/js resolves to a real export', () => {
  const broken = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const [, names, target] of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const exported = exportsOf(readFileSync(new URL(target.replace('./', ''), dir), 'utf8'));
      for (const n of names.split(',').map(s => s.trim()).filter(Boolean)) {
        const name = n.split(/\s+as\s+/)[0];
        if (!exported.has(name)) broken.push(`${f} imports ${name} from ${target}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});
