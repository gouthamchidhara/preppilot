import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../web/js/app.js', import.meta.url), 'utf8');
const flat = css.replace(/\s+/g, ' ');

test('drawer open on narrow screens: the page header is hidden but keeps its space', () => {
  // When the panel opens on mobile the shell slides right carrying its
  // header; without this rule the menu button strands at the far right,
  // over the panel edge, detached from the panel it controls.
  assert.ok(
    flat.includes('@media (max-width: 899px) { body.drawer-open .top { visibility: hidden; } }'),
    'app.css must hide body.drawer-open .top under max-width: 899px',
  );
  // visibility, not display: collapsing the header pulls the page content
  // up into the top row, so the home heading sits cut off beside the
  // panel's own header (PrepPilot + search).
  assert.ok(
    !flat.includes('@media (max-width: 899px) { body.drawer-open .top { display: none; } }'),
    'app.css must not display:none the drawer-open header — that collapses its height',
  );
});

test('drawer open on narrow screens: the slid-away page is dimmed', () => {
  // Without a scrim the 70px strip of the slid-away shell shows the page's
  // big heading, search box and chips cut mid-word — it reads as a torn
  // live page, not background. Same scrim value as #sheet / .ai-scrim.
  // Opacity is driven by --scrim-o so the drag can fade the dim in with
  // the finger; the settled open state sets it on #shell, where an inline
  // value set mid-drag still wins.
  assert.ok(
    flat.includes("#shell::after { content: ''; position: absolute; inset: 0; z-index: 30; border-radius: inherit; background: rgba(15, 20, 21, .45); opacity: var(--scrim-o, 0); pointer-events: none; transition: opacity .32s; }"),
    'app.css must define a #shell::after scrim under max-width: 899px',
  );
  assert.ok(
    flat.includes('body.drawer-open #shell { --scrim-o: 1; }'),
    'app.css must dim the shell while the drawer is open',
  );
  assert.ok(
    flat.includes('body.drawer-open #shell::after { pointer-events: auto; }'),
    'app.css must let taps on the dimmed strip close the panel',
  );
  assert.ok(
    flat.includes('body.drawer-drag #shell::after { transition: none; }'),
    'app.css must not lag the scrim behind the finger mid-drag',
  );
});

test('drawer swipe: horizontal drags go to the gesture, not the browser scroll', () => {
  // Without touch-action: pan-y the browser claims horizontal drags for
  // scrolling and fires touchcancel mid-swipe; there was no touchcancel
  // handler, so a cancelled drag left the panel stuck half-open with its
  // transitions disabled.
  assert.ok(
    /#shell \{[^}]*touch-action: pan-y;/.test(css),
    'app.css must set touch-action: pan-y on #shell',
  );
  assert.ok(
    /\.nd \{[^}]*touch-action: pan-y;/.test(css),
    'app.css must set touch-action: pan-y on .nd',
  );
  assert.ok(
    js.includes("document.addEventListener('touchcancel', endDrawerDrag)"),
    'app.js must settle a cancelled drawer drag like a release',
  );
  assert.ok(
    js.includes('function endDrawerDrag()') && js.includes('requestAnimationFrame(() => {'),
    'app.js must glide from the finger position on release, not snap',
  );
});

test('panel header has its own close button next to search', () => {
  // The open panel's top row must read as one header: PrepPilot + search +
  // hamburger, all at the same height. The button reuses the same
  // data-act="drawer" toggle as the page header's menu button.
  assert.ok(
    js.includes('<button class="nd-round nd-menu" data-act="drawer" aria-label="Close panel">${ic(\'menu\')}</button>'),
    'app.js nd-head must have a hamburger button wired to the drawer toggle',
  );
  assert.ok(
    flat.includes('body.has-drawer .nd-menu { display: none; }'),
    'app.css must hide the panel close button on wide screens (permanent sidebar)',
  );
});
