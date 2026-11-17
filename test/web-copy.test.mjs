import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync(new URL('../web/js/app.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('web copy: no AI-written or AI-generated wording anywhere users can see', () => {
  for (const [name, src] of [['web/js/app.js', appJs], ['web/index.html', indexHtml]]) {
    assert.doesNotMatch(src, /AI-written/, `${name} still says AI-written`);
    assert.doesNotMatch(src, /AI-generated/, `${name} still says AI-generated`);
  }
});

test('web copy: the beta note still offers a quiet Report a problem link', () => {
  assert.match(appJs, /Report a problem/);
  assert.match(appJs, /betaNote/);
});
