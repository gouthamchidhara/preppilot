import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../web/content/nudges.json', import.meta.url), 'utf8'));

test('nudges file: exactly 50 fresh rotating messages', () => {
  assert.equal(data.version, 1);
  assert.equal(data.nudges.length, 50);
  const titles = new Set();
  let withPlaceholder = 0;
  for (const n of data.nudges) {
    assert.equal(typeof n.title, 'string');
    assert.equal(typeof n.body, 'string');
    assert.ok(n.title.length > 0 && n.title.length <= 40, `title too long: ${n.title}`);
    assert.ok(n.body.length > 0 && n.body.length <= 110, `body too long: ${n.body}`);
    assert.doesNotMatch(n.title + n.body, /!/); // no exclamation marks
    assert.doesNotMatch(n.title + n.body, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // no emoji
    assert.ok(!titles.has(n.title), `duplicate title: ${n.title}`);
    titles.add(n.title);
    const placeholders = [...(n.body.match(/\{[^}]+\}/g) || [])];
    for (const ph of placeholders) assert.ok(ph === '{topic}' || ph === '{due}', `unknown placeholder ${ph}`);
    if (placeholders.length) withPlaceholder++;
  }
  assert.ok(withPlaceholder >= 20, `only ${withPlaceholder} nudges use {topic} or {due}`);
});
