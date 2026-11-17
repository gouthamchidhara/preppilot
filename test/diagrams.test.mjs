import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramFor, diagramHtml } from '../web/js/diagrams.js';

test('diagrams exist for the three mapped topics and nowhere else', () => {
  for (const id of ['web-fundamentals', 'jvm', 'k8s']) {
    const d = diagramFor(id);
    assert.ok(d, `${id} has no diagram`);
    assert.equal(typeof d.title, 'string');
    assert.ok(d.title.length > 0);
    assert.equal(typeof d.caption, 'string');
    assert.ok(d.caption.length > 20);
    assert.match(d.svg, /^<svg /);
    assert.match(d.svg, /<\/svg>$/);
    assert.match(d.svg, /role="img"/);
    assert.doesNotMatch(d.svg, /<script/);
  }
  assert.equal(diagramFor('sql'), null);
  assert.equal(diagramFor('not-a-topic'), null);
  assert.equal(diagramHtml('sql'), '');
  assert.match(diagramHtml('k8s'), /<figure class="diagram">/);
});

test('each diagram names the concept it explains', () => {
  assert.match(diagramFor('web-fundamentals').svg, /DNS/);
  assert.match(diagramFor('web-fundamentals').svg, /TCP \+ TLS/);
  assert.match(diagramFor('jvm').svg, /Eden/);
  assert.match(diagramFor('jvm').svg, /Old generation/);
  assert.match(diagramFor('k8s').svg, /Pod 1/);
  assert.match(diagramFor('k8s').svg, /Control plane/);
  assert.match(diagramFor('k8s').svg, /Service/);
});

test('diagram animation classes are the ones app.css defines', () => {
  const all = ['web-fundamentals', 'jvm', 'k8s'].map(id => diagramFor(id).svg).join('');
  for (const cls of ['dg-draw', 'dg-step', 'dg-pop', 'dg-march', 'dg-sweep']) {
    assert.ok(all.includes(cls), `no diagram uses ${cls}`);
  }
});
