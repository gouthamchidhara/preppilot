import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/app.css', import.meta.url), 'utf8');

test('drawer open on narrow screens: the page header is hidden', () => {
  // When the panel opens on mobile the shell slides right carrying its
  // header; without this rule the menu button strands at the far right,
  // over the panel edge, detached from the panel it controls.
  const flat = css.replace(/\s+/g, ' ');
  assert.ok(
    flat.includes('@media (max-width: 899px) { body.drawer-open .top { display: none; } }'),
    'app.css must hide body.drawer-open .top under max-width: 899px',
  );
});
