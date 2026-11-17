// Animated concept diagrams: small inline SVGs that show how something works.
// Every topic gets one (see diagram-data.js for the specs).
//
// A lesson is a story, and the diagram is the story's visual thread: it
// BUILDS piece by piece as the reader moves through the lesson cards. The
// renderer takes a view — how many pieces are built, which stage is the
// current scene, which piece has just been unlocked — and every element is
// one of three things:
//   built   — drawn normally (the current scene gets an accent outline)
//   fresh   — the piece that just unlocked: it pops / draws itself in
//   ghost   — not yet reached: a faint dashed outline of what is coming
// Focused stages dim everything else, so the eye stays on the current scene.
// Motion is slow and explains the flow: boxes pop in one beat at a time,
// connectors draw themselves, and a dot travels the main path so the eye
// follows the flow — never decoration. Every animation ends in its final,
// fully drawn state, so the reduced-motion rule in app.css (which collapses
// animations to their end state) leaves a complete static diagram.
// No assets, no Blob storage: inline SVG is enough.
import { SPECS } from './diagram-data.js';
import { stageLabel, storyPieces } from './animate.js';

// Custom subjects carry their own diagram with them: the AI writes a simple
// flow spec when it generates the guide, and it is registered here at load
// (and right after generation) so the story strip works exactly like a
// built-in topic. Anything malformed is refused — the guide still works
// without a diagram.
const customSpecs = new Map();
export function isValidDiagramSpec(spec) {
  if (!spec || spec.kind !== 'flow') return false;
  if (!Array.isArray(spec.nodes) || spec.nodes.length < 2 || spec.nodes.length > 4) return false;
  if (!spec.nodes.every(n => n && typeof n.label === 'string' && n.label.trim())) return false;
  if (!Array.isArray(spec.steps) || spec.steps.length < 2 || spec.steps.length > 4) return false;
  if (!spec.steps.every(s => typeof s === 'string' && s.trim())) return false;
  return true;
}
export function registerDiagramSpec(topicId, spec) {
  if (isValidDiagramSpec(spec)) customSpecs.set(topicId, spec);
}
// Plain-meaning overlays (web/content/meaning/<pack>.json): an everyday analogy plus captions
// rewritten around it. The boxes and stages stay those of the spec; only the words change.
const meanings = new Map();
export function registerDiagramMeaning(topicId, m) {
  const base = SPECS[topicId];
  if (!base || !m?.analogy?.name) return;
  if (m.steps !== undefined && (!Array.isArray(m.steps) || m.steps.length !== base.steps.length)) return;
  meanings.set(topicId, m);
}
export function specFor(topicId) {
  const base = SPECS[topicId] || customSpecs.get(topicId) || null;
  const m = meanings.get(topicId);
  return base && m ? { ...base, caption: m.caption || base.caption, steps: m.steps || base.steps, analogy: m.analogy } : base;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 600;

// The build sequencer: elements are emitted in story order, each one a piece.
// view = { pieces (how many are built), focus (stage to highlight; null or
//          undefined = none), fresh (piece index that just unlocked,
//          'all' = every piece plays its entrance, null = none),
//          highlight (when true, non-focus stages stay fully visible —
//          only the current scene gets its outline; otherwise they dim) }.
function sequencer(view) {
  let i = 0;
  const lastStage = { v: 0 };
  return {
    // stage: the story stage this element belongs to. Returns the classes
    // and whether it plays an entrance, for the next piece in build order.
    next(stage) {
      const piece = i++;
      const built = piece < view.pieces;
      if (built) lastStage.v = stage;
      const cls = !built ? ' dg-ghost'
        : view.focus === null || view.focus === undefined ? ''
        : stage === view.focus ? ' dg-active' : (view.highlight ? '' : ' dg-dim');
      const fresh = built && (view.fresh === 'all' || view.fresh === piece);
      return { piece, built, cls, fresh };
    },
    count() { return i; },
    lastStage() { return lastStage.v; },
  };
}

const ARROW = id => `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" style="fill:var(--muted)"/></marker></defs>`;

// A box. Fresh boxes pop in; built boxes sit still; ghosts are outlines.
const box = (x, y, w, h, label, sub, e, delay = 0, topLabel = false, cls = '') =>
  `<g class="dg-box${e.fresh ? ' dg-pop' : ''}${e.cls}${cls ? ' ' + cls : ''}"${e.fresh ? ` style="animation-delay:${delay}s"` : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
  + (topLabel
    ? `<text class="dg-t" x="${x + 12}" y="${y + 19}">${esc(label)}</text>`
    : `<text class="dg-t" x="${x + w / 2}" y="${y + (sub ? h / 2 - 2 : h / 2 + 5)}" text-anchor="middle">${esc(label)}</text>`
      + (sub ? `<text class="dg-s" x="${x + w / 2}" y="${y + h / 2 + 16}" text-anchor="middle">${esc(sub)}</text>` : ''))
  + `</g>`;

const stepBadge = (cx, label, e, delay) =>
  `<g class="dg-step${e.fresh ? ' dg-pop' : ''}${e.cls}"${e.fresh ? ` style="animation-delay:${delay}s"` : ''}><circle cx="${cx}" cy="36" r="11"/><text class="dg-n" x="${cx}" y="40" text-anchor="middle">${label}</text></g>`;

// A connector. Fresh lines draw themselves; built lines sit still; marching
// lines keep moving forever (tree links, map links that carry flow).
const line = (d, e, delay, uid, march = false) =>
  `<path class="dg-line${march ? ' dg-march' : e.fresh ? ' dg-draw' : ''}${e.cls}"${e.fresh && !march ? ` style="animation-delay:${delay}s" pathLength="100"` : ''} d="${d}" marker-end="url(#dg-arr-${uid})"/>`;

// The travelling dot: a solid accent dot that rides the main path on a loop.
// offset-path on an SVG circle works in Chromium (verified: the dot's
// offset-distance advances 0% -> 100% over its duration). The CSS animation
// (dg-travel) is covered by the reduced-motion rule, so it stops with the rest.
const dot = (path, dur, cx, cy) =>
  `<circle class="dg-dot" cx="${cx}" cy="${cy}" r="5" style="offset-path:path('${path}');animation-duration:${dur}s"/>`;

const svgOpen = (h, label) => `<svg class="dg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;

/* ---------- flow / state: boxes in a row, arrows between, optional return ---------- */
function renderFlow(spec, view, uid, ret) {
  const nodes = spec.nodes;
  const n = nodes.length;
  const slot = W / n;
  const bw = slot - 18;
  const h = ret ? 210 : 150;
  const centers = nodes.map((_, i) => i * slot + slot / 2);
  const q = sequencer(view);
  let s = svgOpen(h, `${spec.title}: ${nodes.map(t => t.label).join(', then ')}`);
  s += ARROW(`dg-arr-${uid}`);
  for (let i = 0; i < n; i++) {
    const t = nodes[i];
    // A node (badge + box) is one story beat; the line after it is the next.
    const e = q.next(i);
    s += stepBadge(centers[i], String(i + 1), e, i * 0.35);
    s += box(i * slot + 9, 58, bw, 52, t.label, t.sub, e, i * 0.35);
    if (i < n - 1) {
      s += line(`M${i * slot + 9 + bw} 84 H${(i + 1) * slot + 9}`, q.next(i + 1), 0.2 + i * 0.35, uid);
    }
  }
  if (ret) {
    s += line(`M${centers[n - 1]} 110 V 168 H ${centers[0]} V 110`, q.next(n - 1), 0.2 + (n - 1) * 0.35, uid);
    const e = q.next(n - 1);
    s += `<text class="dg-s${e.cls}" x="300" y="192" text-anchor="middle">${esc(ret)}</text>`;
  }
  if (view.pieces >= 2) s += dot(`M ${centers[0]} 84 H ${centers[n - 1]}`, 3.5 + n * 0.4, centers[0], 84);
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- layers: full-width bands, top to bottom ---------- */
function renderLayers(spec, view) {
  const bands = spec.bands;
  const h = 8 + bands.length * 54;
  const q = sequencer(view);
  let s = svgOpen(h, `${spec.title}: ${bands.map(t => t.label).join(', ')}`);
  bands.forEach((b, i) => {
    const y = 8 + i * 54;
    const e = q.next(i);
    s += `<g class="dg-box${e.fresh ? ' dg-pop' : ''}${e.cls}"${e.fresh ? ` style="animation-delay:${i * 0.3}s"` : ''}><rect x="8" y="${y}" width="584" height="46" rx="8"/>`
      + `<text class="dg-t" x="24" y="${y + 28}">${esc(b.label)}</text>`
      + `<text class="dg-s" x="576" y="${y + 28}" text-anchor="end">${esc(b.sub)}</text></g>`;
  });
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- stack: pyramid tiers, array order is base-first ---------- */
function renderStack(spec, view) {
  const tiers = spec.tiers;
  // Widths are ordered top-first: the top tier is the narrowest.
  const widths = [256, 420, 584].slice(0, tiers.length);
  const h = 10 + tiers.length * 60;
  const q = sequencer(view);
  let s = svgOpen(h, `${spec.title}: ${tiers.map(t => t.label).join(', ')}`);
  tiers.forEach((t, i) => {
    // Base tier (array index 0) renders at the bottom; it also appears first.
    const row = tiers.length - 1 - i;
    const w = widths[row] ?? 200;
    const x = (W - w) / 2;
    const y = 10 + row * 60;
    s += box(x, y, w, 52, t.label, t.sub, q.next(i), i * 0.35);
  });
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- cycle: four nodes around an ellipse, clockwise ---------- */
function renderCycle(spec, view, uid) {
  const nodes = spec.nodes;
  const pts = [[300, 40], [520, 110], [300, 180], [80, 110]];
  const path = 'M 300 40 A 220 70 0 1 1 300 180 A 220 70 0 1 1 300 40';
  const q = sequencer(view);
  let s = svgOpen(220, `${spec.title}: ${nodes.map(t => t.label).join(', then ')}`);
  s += `<path class="dg-line dg-march" d="${path}"/>`;
  if (view.pieces >= 2) s += dot(path, 6, 300, 40);
  nodes.forEach((t, i) => {
    const [cx, cy] = pts[i];
    s += box(cx - 75, cy - 22, 150, 44, t.label, t.sub, q.next(i), i * 0.35);
  });
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- split: two columns compared ---------- */
function renderSplit(spec, view) {
  const cols = [spec.left, spec.right];
  const q = sequencer(view);
  let s = svgOpen(200, `${spec.title}: ${spec.left.title} versus ${spec.right.title}`);
  cols.forEach((c, i) => {
    const x = 8 + i * 300;
    const e = q.next(i);
    s += `<g class="dg-box${e.fresh ? ' dg-pop' : ''}${e.cls}"${e.fresh ? ` style="animation-delay:${i * 0.35}s"` : ''}><rect x="${x}" y="8" width="284" height="184" rx="8"/>`
      + `<text class="dg-t" x="${x + 142}" y="36" text-anchor="middle">${esc(c.title)}</text>`
      + `<path class="dg-line" d="M ${x + 20} 48 H ${x + 264}"/>`
      + c.items.map((it, j) => `<text class="dg-s" x="${x + 142}" y="${76 + j * 34}" text-anchor="middle">${esc(it)}</text>`).join('')
      + `</g>`;
  });
  const e = q.next(1);
  s += `<g class="dg-vs${e.fresh ? ' dg-pop' : ''}${e.cls}"${e.fresh ? ' style="animation-delay:.5s"' : ''}><circle cx="300" cy="100" r="14" style="fill:var(--accent)"/><text x="300" y="104" text-anchor="middle" style="fill:var(--paper);font-size:11px;font-weight:600">vs</text></g>`;
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- tree: one root, children below ---------- */
function renderTree(spec, view, uid) {
  const kids = spec.kids;
  const n = kids.length;
  const slot = W / n;
  const bw = slot - 18;
  const q = sequencer(view);
  let s = svgOpen(190, `${spec.title}: ${spec.root.label} with ${kids.map(k => k.label).join(', ')}`);
  s += ARROW(`dg-arr-${uid}`);
  s += box(200, 8, 200, 42, spec.root.label, spec.root.sub, q.next(0), 0);
  kids.forEach((k, i) => {
    const cx = i * slot + slot / 2;
    // A child arriving (link + box) is one story beat.
    const e = q.next(i + 1);
    // Connectors keep marching once built, so the tree never sits still.
    s += `<path class="dg-line${e.fresh ? ' dg-draw' : ' dg-march'}${e.cls}"${e.fresh ? ` style="animation-delay:${0.25 + i * 0.3}s" pathLength="100"` : ''} d="M 300 50 V 86 H ${cx} V 120" marker-end="url(#dg-arr-${uid})"/>`;
    s += box(i * slot + 9, 120, bw, 52, k.label, k.sub, e, 0.25 + i * 0.3);
  });
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- bars: horizontal bars that grow ---------- */
function renderBars(spec, view) {
  const bars = spec.bars;
  const h = 12 + bars.length * 44 + 8;
  const q = sequencer(view);
  let s = svgOpen(h, `${spec.title}: ${bars.map(b => b.label).join(', ')}`);
  bars.forEach((b, i) => {
    const y = 12 + i * 44;
    const w = Math.round((440 * b.value) / 100);
    const e = q.next(i);
    s += `<g class="${e.fresh ? 'dg-pop' : ''}${e.cls}"${e.fresh ? ` style="animation-delay:${i * 0.15}s"` : ''}><text class="dg-t" x="8" y="${y + 17}">${esc(b.label)}</text>`
      + `<rect class="dg-track" x="140" y="${y}" width="440" height="22" rx="6"/>`
      + `<rect class="dg-grow${e.fresh ? '' : ' dg-grown'}"${e.fresh ? ` style="animation-delay:${i * 0.25}s"` : ''} x="140" y="${y}" width="${w}" height="22" rx="6"/>`
      + `<text class="dg-s" x="${140 + w + 8}" y="${y + 16}">${esc(b.note)}</text></g>`;
  });
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

/* ---------- map: explicit boxes/links inside an optional cluster ---------- */
function renderMap(spec, view, uid) {
  const h = spec.h || (spec.cluster ? spec.cluster.y + spec.cluster.h + 8 : 230);
  const q = sequencer(view);
  let s = svgOpen(h, spec.title);
  s += ARROW(`dg-arr-${uid}`);
  // Build order is stage order, so the picture grows the way the story goes.
  const ordered = [];
  if (spec.cluster) ordered.push({ kind: 'cluster', stage: spec.cluster.stage ?? 0, at: -1 });
  for (const [at, b] of (spec.boxes || []).entries()) ordered.push({ kind: 'box', stage: b.stage ?? 0, at });
  for (const [at, l] of (spec.links || []).entries()) ordered.push({ kind: 'link', stage: l.stage ?? 0, at });
  for (const [at, t] of (spec.notes || []).entries()) ordered.push({ kind: 'note', stage: t.stage ?? 0, at });
  ordered.sort((a, b) => a.stage - b.stage || a.at - b.at);
  let dotPath = null;
  for (const el of ordered) {
    if (el.kind === 'cluster') {
      const c = spec.cluster;
      const e = q.next(c.stage ?? 0);
      s += `<g class="dg-box dg-cluster${e.fresh ? ' dg-pop' : ''}${e.cls}"${e.fresh ? ' style="animation-delay:.1s"' : ''}><rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="10"/><text class="dg-s" x="${c.x + 12}" y="${c.y + 18}">${esc(c.label)}</text></g>`;
    } else if (el.kind === 'box') {
      const b = spec.boxes[el.at];
      s += box(b.x, b.y, b.w, b.h, b.label, b.sub || '', q.next(b.stage ?? 0), 0.15 + (b.stage ?? 0) * 0.3, !!b.topLabel, b.cls || '');
    } else if (el.kind === 'link') {
      const l = spec.links[el.at];
      const e = q.next(l.stage ?? 0);
      if (l.march && e.built && !dotPath) dotPath = l.d;
      s += line(l.d, e, 0.3 + (l.stage ?? 0) * 0.3, uid, !!l.march);
    } else {
      const t = spec.notes[el.at];
      const e = q.next(t.stage ?? 0);
      s += `<text class="dg-s${e.cls}" x="${t.x}" y="${t.y}" text-anchor="middle">${esc(t.text)}</text>`;
    }
  }
  if (spec.sweep) {
    const e = q.next(spec.sweep.stage ?? 0);
    // The sweep is the collector: it keeps moving, so the diagram is alive
    // even when the reader has stopped on a stage.
    s += `<rect class="dg-sweep${e.cls}" x="${spec.sweep.x}" y="${spec.sweep.y}" width="${spec.sweep.w}" height="${spec.sweep.h}" rx="6"/>`;
  }
  if (dotPath && view.pieces >= 2) s += dot(dotPath, 4, 0, 0);
  return { svg: s + '</svg>', pieces: q.count(), focusStage: q.lastStage() };
}

function renderSpec(spec, view, uid) {
  switch (spec.kind) {
    case 'flow': return renderFlow(spec, view, uid, spec.ret);
    case 'state': return renderFlow(spec, view, uid, spec.ret);
    case 'layers': return renderLayers(spec, view);
    case 'stack': return renderStack(spec, view);
    case 'cycle': return renderCycle(spec, view, uid);
    case 'split': return renderSplit(spec, view);
    case 'tree': return renderTree(spec, view, uid);
    case 'bars': return renderBars(spec, view);
    case 'map': return renderMap(spec, view, uid);
    default: return { svg: '', pieces: 0, focusStage: 0 };
  }
}

// How many pieces a spec builds into, without rendering it.
function countPieces(spec) {
  switch (spec.kind) {
    case 'flow': case 'state': return 2 * spec.nodes.length - 1 + (spec.ret ? 2 : 0);
    case 'layers': return spec.bands.length;
    case 'stack': return spec.tiers.length;
    case 'cycle': return spec.nodes.length;
    case 'split': return 3;
    case 'tree': return 1 + spec.kids.length;
    case 'bars': return spec.bars.length;
    case 'map': return (spec.cluster ? 1 : 0) + (spec.boxes?.length || 0) + (spec.links?.length || 0) + (spec.notes?.length || 0) + (spec.sweep ? 1 : 0);
    default: return 0;
  }
}

// view: { pieces, focus, fresh, highlight }. pieces defaults to all (the
// full diagram). focus null = no stage highlighted (the full view); focus
// undefined = auto — the stage of the last built piece, so the story strip
// always highlights the scene the reader is on.
function renderDiagram(topicId, view = {}) {
  const spec = specFor(topicId);
  if (!spec) return null;
  const uid = topicId.replace(/[^a-z0-9]+/g, '-');
  const total = countPieces(spec);
  const pieces = view.pieces === undefined || view.pieces === null ? total : Math.min(total, view.pieces);
  const v = { pieces, focus: view.focus, fresh: view.fresh === undefined ? null : view.fresh, highlight: !!view.highlight };
  // Auto focus needs the stage of the last built piece, which is only known
  // after a render — so render once to learn it, then again with it set, so
  // the current scene gets its outline.
  if (v.focus === undefined) v.focus = renderSpec(spec, v, uid).focusStage;
  const out = renderSpec(spec, v, uid);
  return { title: spec.title, svg: out.svg, caption: spec.caption, steps: spec.steps, stageCount: spec.steps.length, pieces: total, focus: v.focus };
}

export function diagramFor(topicId) {
  const d = renderDiagram(topicId, { pieces: null, focus: null, fresh: 'all' });
  if (!d) return null;
  return { title: d.title, svg: d.svg, caption: d.caption, steps: d.steps, stageCount: d.stageCount, pieces: d.pieces };
}

function figureHtml(topicId, d, opts = {}) {
  const focus = d.focus;
  const cap = focus === null || focus === undefined ? d.caption : (d.steps[focus] || d.caption);
  const n = d.steps.length;
  const controls = opts.controls === undefined || opts.controls;
  const an = specFor(topicId)?.analogy;
  return `<figure class="diagram${opts.compact ? ' compact' : ''}" data-dg="${esc(topicId)}"${opts.autoplay ? ' data-autoplay="1"' : ''}><div class="label">${esc(d.title)}</div>`
    + (an ? `<p class="analogy"><b>Think of it as ${esc(/^[A-Z][a-z]/.test(an.name) ? an.name[0].toLowerCase() + an.name.slice(1) : an.name)}.</b> ${esc(an.line)}</p>` : '')
    + d.svg
    + `<figcaption>${esc(cap)}</figcaption>`
    + (controls ? `<div class="dg-controls">`
    + `<button class="btn quiet small" type="button" data-act="dgprev" data-id="${esc(topicId)}" ${focus === null || focus === undefined ? 'disabled' : ''}>‹ Back</button>`
    + `<span class="dg-stage">${esc(stageLabel(focus, n))}</span>`
    + `<button class="btn quiet small" type="button" data-act="dgnext" data-id="${esc(topicId)}" ${focus === n - 1 ? 'disabled' : ''}>Next ›</button>`
    + `<button class="btn quiet small" type="button" data-act="dgreplay" data-id="${esc(topicId)}">Replay</button>`
    + `</div>` : '')
    + `</figure>`;
}

// The step player: stage null = the full diagram (plays its draw-in);
// a number = that stage, with the rest dimmed. Replay re-renders the full
// diagram, which restarts the draw-in.
// opts: { reveal (pieces built — story mode), focus, fresh, controls, compact, autoplay }
export function diagramHtml(topicId, stage = null, opts = {}) {
  const d = renderDiagram(topicId, {
    pieces: opts.reveal === undefined ? null : opts.reveal,
    focus: opts.focus === undefined ? stage : opts.focus,
    fresh: opts.fresh === undefined ? (stage === null && opts.reveal === undefined ? 'all' : null) : opts.fresh,
  });
  if (!d) return '';
  return figureHtml(topicId, d, opts);
}

// The story strip for a lesson card: the diagram built up to the piece this
// card unlocks, compact, no player controls (the lesson itself is the
// player). Returns the strip HTML plus the scene metadata the lesson header
// needs, or null when the topic has no diagram.
export function storyView(topicId, ci, total) {
  const spec = specFor(topicId);
  if (!spec) return null;
  const st = storyPieces(ci, total, countPieces(spec));
  const d = renderDiagram(topicId, { pieces: st.built, focus: undefined, fresh: st.fresh, highlight: true });
  return {
    html: figureHtml(topicId, d, { compact: true, controls: false }) +
      `<div class="row between" style="margin-top:6px"><span></span><button class="link quiet small" data-act="dgsheet" data-id="${esc(topicId)}">Walk through the full diagram</button></div>`,
    focus: d.focus, steps: d.steps.length, built: st.built, pieces: d.pieces,
  };
}
