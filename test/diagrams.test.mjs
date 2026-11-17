import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { diagramFor, diagramHtml, storyView, registerDiagramSpec, isValidDiagramSpec } from '../web/js/diagrams.js';

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

test('the story strip builds the diagram card by card', () => {
  // Web Fundamentals over 9 cards: the first card shows only the first
  // piece (the rest is a faint ghost), the last card shows the whole picture.
  const first = storyView('web-fundamentals', 0, 9);
  assert.ok(first, 'story strip exists for a diagram topic');
  assert.equal(first.built, 1);
  assert.equal(first.focus, 0);
  assert.match(first.html, /dg-ghost/, 'later pieces are ghosts on card 1');
  assert.match(first.html, /diagram compact/);
  assert.doesNotMatch(first.html, /data-act="dgnext"/, 'the strip has no player controls — the lesson is the player');
  assert.match(first.html, /Walk through the full diagram/);
  const last = storyView('web-fundamentals', 8, 9);
  assert.equal(last.built, last.pieces);
  assert.equal(last.focus, last.steps - 1);
  assert.doesNotMatch(last.html, /dg-ghost/, 'the full picture has no ghosts on the last card');
  // The build never goes backwards mid-lesson.
  const builds = Array.from({ length: 9 }, (_, ci) => storyView('web-fundamentals', ci, 9).built);
  for (let i = 1; i < builds.length; i++) assert.ok(builds[i] >= builds[i - 1]);
});

test('storyView returns null where there is no diagram to build', () => {
  assert.equal(storyView('not-a-topic', 0, 3), null);
});

test('custom subjects register their own diagram and get the same story strip', () => {
  const spec = {
    kind: 'flow', title: 'How Ansible runs', caption: 'Control node to hosts.',
    nodes: [{ label: 'Write', sub: 'a playbook' }, { label: 'Run', sub: 'ansible-playbook' }, { label: 'Apply', sub: 'on each host' }],
    steps: ['Write: a playbook', 'Run: ansible-playbook', 'Apply: on each host'],
  };
  assert.equal(isValidDiagramSpec(spec), true);
  assert.equal(isValidDiagramSpec({ kind: 'flow', nodes: [{ label: 'Only one' }], steps: ['one'] }), false);
  assert.equal(isValidDiagramSpec({ kind: 'cycle', nodes: [], steps: [] }), false);
  assert.equal(isValidDiagramSpec(null), false);
  registerDiagramSpec('c-ansible-test', spec);
  assert.match(diagramFor('c-ansible-test').svg, /Write/);
  assert.match(diagramFor('c-ansible-test').svg, /ansible-playbook/);
  const strip = storyView('c-ansible-test', 0, 6);
  assert.ok(strip, 'custom topic gets a story strip');
  assert.equal(strip.built, 1);
  assert.match(strip.html, /dg-ghost/);
  const last = storyView('c-ansible-test', 5, 6);
  assert.equal(last.built, last.pieces);
  assert.doesNotMatch(last.html, /dg-ghost/);
  // A refused spec never registers: the topic still works, just without a diagram.
  registerDiagramSpec('c-bad-test', { kind: 'flow', nodes: [{ label: 'x' }], steps: [] });
  assert.equal(storyView('c-bad-test', 0, 3), null);
});
