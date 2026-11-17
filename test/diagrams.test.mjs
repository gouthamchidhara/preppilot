import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { diagramFor, diagramHtml } from '../web/js/diagrams.js';

// The packs on disk are the source of truth for which topics exist.
function packTopicIds() {
  const dir = new URL('../web/content/packs/', import.meta.url);
  const ids = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const t of j.topics || []) ids.push(t.id);
  }
  return ids;
}

// Minimal XML well-formedness check: tags balance, no stray markup.
function assertWellFormedXml(svg, id) {
  const stack = [];
  for (const m of svg.matchAll(/<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (m[0].startsWith('<!--')) continue;
    const [, name, , selfClose] = m;
    const closing = m[0].startsWith('</');
    if (closing) {
      assert.equal(stack.pop(), name, `${id}: closing </${name}> does not match the open tag`);
    } else if (!selfClose && !/^(path|rect|circle|line|polyline|polygon|ellipse|use|stop)$/.test(name)) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `${id}: unclosed tags: ${stack.join(', ')}`);
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;|#39;)/, `${id}: unescaped & in SVG`);
}

test('every pack topic has a diagram', () => {
  const ids = packTopicIds();
  assert.equal(ids.length, 72, `expected 72 pack topics, got ${ids.length}`);
  for (const id of ids) {
    assert.ok(diagramFor(id), `${id} has no diagram`);
  }
  assert.equal(diagramFor('not-a-topic'), null);
  assert.equal(diagramHtml('not-a-topic'), '');
});

test('each diagram is well-formed, safe, and complete', () => {
  for (const id of packTopicIds()) {
    const d = diagramFor(id);
    assert.equal(typeof d.title, 'string');
    assert.ok(d.title.length > 0, `${id}: empty title`);
    assert.equal(typeof d.caption, 'string');
    assert.ok(d.caption.length > 20, `${id}: caption too short to teach anything`);
    assert.ok(Array.isArray(d.steps) && d.steps.length >= 2, `${id}: needs at least 2 stages`);
    assert.equal(d.stageCount, d.steps.length, `${id}: stageCount disagrees with steps`);
    assert.match(d.svg, /^<svg /);
    assert.match(d.svg, /<\/svg>$/);
    assert.match(d.svg, /role="img"/);
    assert.doesNotMatch(d.svg, /<script/, `${id}: script in SVG`);
    assertWellFormedXml(d.svg, id);
  }
});

test('diagram animation classes are the ones app.css defines', () => {
  const css = readFileSync(new URL('../web/app.css', import.meta.url), 'utf8');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  for (const id of packTopicIds()) {
    const html = diagramHtml(id);
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const cls of m[1].split(/\s+/)) {
        assert.ok(defined.has(cls), `${id}: class .${cls} is used but not defined in app.css`);
      }
    }
  }
});

test('the player steps through stages and dims the rest', () => {
  const full = diagramHtml('sql');
  assert.match(full, /Full diagram/);
  assert.match(full, /data-act="dgprev"/);
  assert.match(full, /data-act="dgnext"/);
  assert.match(full, /data-act="dgreplay"/);
  assert.doesNotMatch(full, /dg-dim/, 'full view must not dim anything');
  const first = diagramHtml('sql', 0);
  assert.match(first, /Step 1 of 4/);
  assert.match(first, /dg-dim/);
  assert.match(first, /dg-active/);
  assert.match(first, /Parse: the database checks the syntax/);
  const last = diagramHtml('sql', 3);
  assert.match(last, /Step 4 of 4/);
  assert.match(last, /only what you asked for/);
  assert.match(diagramHtml('k8s'), /<figure class="diagram"/);
});

test('each diagram names the concept it explains', () => {
  assert.match(diagramFor('web-fundamentals').svg, /DNS/);
  assert.match(diagramFor('web-fundamentals').svg, /TCP \+ TLS/);
  assert.match(diagramFor('jvm').svg, /Eden/);
  assert.match(diagramFor('jvm').svg, /Old generation/);
  assert.match(diagramFor('k8s').svg, /Pod 1/);
  assert.match(diagramFor('k8s').svg, /Control plane/);
  assert.match(diagramFor('k8s').svg, /Service/);
  assert.match(diagramFor('dsa').svg, /O\(n/);
  assert.match(diagramFor('git').svg, /Staging area/);
  assert.match(diagramFor('js-core').svg, /Call stack/);
  assert.match(diagramFor('behavioral').svg, /Result/);
  assert.match(diagramFor('react').svg, /App/);
});
