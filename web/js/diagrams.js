// Animated concept diagrams: small inline SVGs that show how something works.
// Every topic gets one (see diagram-data.js for the specs; the three originals
// below are hand-built and kept as-is). Motion is slow and explains the flow:
// boxes pop in one beat at a time, connectors draw themselves, and a dot
// travels the main path so the eye follows the flow — never decoration.
// Every animation ends in its final, fully drawn state, so the reduced-motion
// rule in app.css (which collapses animations to their end state) leaves a
// complete static diagram. No assets, no Blob storage: inline SVG is enough.
import { SPECS } from './diagram-data.js';
import { stageLabel } from './animate.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 600;

// When a stage is selected, its elements get dg-active and everything else
// dims (focus + context). Null stage = the full diagram, nothing dimmed.
const stCls = (i, cur) => cur === null || cur === undefined ? '' : (i === cur ? ' dg-active' : ' dg-dim');
const ARROW = id => `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" style="fill:var(--muted)"/></marker></defs>`;

// A box. delay staggers the pop-in, one beat per stage.
const box = (x, y, w, h, label, sub, stage, cur, delay = 0, topLabel = false) =>
  `<g class="dg-box dg-pop${stCls(stage, cur)}" style="animation-delay:${delay}s"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
  + (topLabel
    ? `<text class="dg-t" x="${x + 12}" y="${y + 19}">${esc(label)}</text>`
    : `<text class="dg-t" x="${x + w / 2}" y="${y + (sub ? h / 2 - 2 : h / 2 + 5)}" text-anchor="middle">${esc(label)}</text>`
      + (sub ? `<text class="dg-s" x="${x + w / 2}" y="${y + h / 2 + 16}" text-anchor="middle">${esc(sub)}</text>` : ''))
  + `</g>`;

const stepBadge = (cx, label, delay, stage, cur) =>
  `<g class="dg-step${stCls(stage, cur)}" style="animation-delay:${delay}s"><circle cx="${cx}" cy="36" r="11"/><text class="dg-n" x="${cx}" y="40" text-anchor="middle">${label}</text></g>`;

// The originals use the short name.
const step = (cx, label, delay) => stepBadge(cx, label, delay, undefined, undefined);

// The travelling dot: a solid accent dot that rides the main path on a loop.
// offset-path is set inline; the CSS animation (dg-travel) is covered by the
// reduced-motion rule, so it stops with everything else.
const dot = (path, dur, cx, cy) =>
  `<circle class="dg-dot" cx="${cx}" cy="${cy}" r="5" style="offset-path:path('${path}');animation-duration:${dur}s"/>`;

const svgOpen = (h, label) => `<svg class="dg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;

/* ---------- flow / state: boxes in a row, arrows between, optional return ---------- */
function renderFlow(spec, cur, uid, ret) {
  const nodes = spec.nodes;
  const n = nodes.length;
  const slot = W / n;
  const bw = slot - 18;
  const h = ret ? 210 : 150;
  const centers = nodes.map((_, i) => i * slot + slot / 2);
  let s = svgOpen(h, `${spec.title}: ${nodes.map(t => t.label).join(', then ')}`);
  s += ARROW(`dg-arr-${uid}`);
  nodes.forEach((t, i) => { s += stepBadge(centers[i], String(i + 1), i * 0.35, i, cur); });
  nodes.forEach((t, i) => { s += box(i * slot + 9, 58, bw, 52, t.label, t.sub, i, cur, i * 0.35); });
  for (let i = 0; i < n - 1; i++) {
    s += `<path class="dg-line dg-draw${stCls(i + 1, cur)}" style="animation-delay:${0.2 + i * 0.35}s" pathLength="100" d="M${i * slot + 9 + bw} 84 H${(i + 1) * slot + 9}" marker-end="url(#dg-arr-${uid})"/>`;
  }
  s += dot(`M ${centers[0]} 84 H ${centers[n - 1]}`, 3.5 + n * 0.4, centers[0], 84);
  if (ret) {
    s += `<path class="dg-line dg-draw${stCls(n - 1, cur)}" style="animation-delay:${0.2 + (n - 1) * 0.35}s" pathLength="100" d="M${centers[n - 1]} 110 V 168 H ${centers[0]} V 110" marker-end="url(#dg-arr-${uid})"/>`;
    s += `<text class="dg-s${stCls(n - 1, cur)}" x="300" y="192" text-anchor="middle">${esc(ret)}</text>`;
  }
  return s + '</svg>';
}

/* ---------- layers: full-width bands, top to bottom ---------- */
function renderLayers(spec, cur) {
  const bands = spec.bands;
  const h = 8 + bands.length * 54;
  let s = svgOpen(h, `${spec.title}: ${bands.map(t => t.label).join(', ')}`);
  bands.forEach((b, i) => {
    const y = 8 + i * 54;
    s += `<g class="dg-box dg-pop${stCls(i, cur)}" style="animation-delay:${i * 0.3}s"><rect x="8" y="${y}" width="584" height="46" rx="8"/>`
      + `<text class="dg-t" x="24" y="${y + 28}">${esc(b.label)}</text>`
      + `<text class="dg-s" x="576" y="${y + 28}" text-anchor="end">${esc(b.sub)}</text></g>`;
  });
  return s + '</svg>';
}

/* ---------- stack: pyramid tiers, array order is base-first ---------- */
function renderStack(spec, cur) {
  const tiers = spec.tiers;
  // Widths are ordered top-first: the top tier is the narrowest.
  const widths = [256, 420, 584].slice(0, tiers.length);
  const h = 10 + tiers.length * 60;
  let s = svgOpen(h, `${spec.title}: ${tiers.map(t => t.label).join(', ')}`);
  tiers.forEach((t, i) => {
    // Base tier (array index 0) renders at the bottom; it also appears first.
    const row = tiers.length - 1 - i;
    const w = widths[row] ?? 200;
    const x = (W - w) / 2;
    const y = 10 + row * 60;
    s += box(x, y, w, 52, t.label, t.sub, i, cur, i * 0.35);
  });
  return s + '</svg>';
}

/* ---------- cycle: four nodes around an ellipse, clockwise ---------- */
function renderCycle(spec, cur, uid) {
  const nodes = spec.nodes;
  const pts = [[300, 40], [520, 110], [300, 180], [80, 110]];
  const path = 'M 300 40 A 220 70 0 1 1 300 180 A 220 70 0 1 1 300 40';
  let s = svgOpen(220, `${spec.title}: ${nodes.map(t => t.label).join(', then ')}`);
  s += `<path class="dg-line dg-march" d="${path}"/>`;
  s += dot(path, 6, 300, 40);
  nodes.forEach((t, i) => {
    const [cx, cy] = pts[i];
    s += box(cx - 75, cy - 22, 150, 44, t.label, t.sub, i, cur, i * 0.35);
  });
  return s + '</svg>';
}

/* ---------- split: two columns compared ---------- */
function renderSplit(spec, cur) {
  const cols = [spec.left, spec.right];
  let s = svgOpen(200, `${spec.title}: ${spec.left.title} versus ${spec.right.title}`);
  cols.forEach((c, i) => {
    const x = 8 + i * 300;
    s += `<g class="dg-box dg-pop${stCls(i, cur)}" style="animation-delay:${i * 0.35}s"><rect x="${x}" y="8" width="284" height="184" rx="8"/>`
      + `<text class="dg-t" x="${x + 142}" y="36" text-anchor="middle">${esc(c.title)}</text>`
      + `<path class="dg-line" d="M ${x + 20} 48 H ${x + 264}"/>`
      + c.items.map((it, j) => `<text class="dg-s" x="${x + 142}" y="${76 + j * 34}" text-anchor="middle">${esc(it)}</text>`).join('')
      + `</g>`;
  });
  s += `<g class="dg-pop" style="animation-delay:.5s"><circle cx="300" cy="100" r="14" style="fill:var(--accent)"/><text x="300" y="104" text-anchor="middle" style="fill:var(--paper);font-size:11px;font-weight:600">vs</text></g>`;
  return s + '</svg>';
}

/* ---------- tree: one root, children below ---------- */
function renderTree(spec, cur, uid) {
  const kids = spec.kids;
  const n = kids.length;
  const slot = W / n;
  const bw = slot - 18;
  let s = svgOpen(190, `${spec.title}: ${spec.root.label} with ${kids.map(k => k.label).join(', ')}`);
  s += ARROW(`dg-arr-${uid}`);
  s += box(200, 8, 200, 42, spec.root.label, spec.root.sub, 0, cur, 0);
  kids.forEach((k, i) => {
    const cx = i * slot + slot / 2;
    s += `<path class="dg-line dg-draw${stCls(i + 1, cur)}" style="animation-delay:${0.25 + i * 0.3}s" pathLength="100" d="M 300 50 V 86 H ${cx} V 120" marker-end="url(#dg-arr-${uid})"/>`;
  });
  kids.forEach((k, i) => {
    s += box(i * slot + 9, 120, bw, 52, k.label, k.sub, i + 1, cur, 0.25 + i * 0.3);
  });
  return s + '</svg>';
}

/* ---------- bars: horizontal bars that grow ---------- */
function renderBars(spec, cur) {
  const bars = spec.bars;
  const h = 12 + bars.length * 44 + 8;
  let s = svgOpen(h, `${spec.title}: ${bars.map(b => b.label).join(', ')}`);
  bars.forEach((b, i) => {
    const y = 12 + i * 44;
    const w = Math.round((440 * b.value) / 100);
    s += `<g class="dg-pop${stCls(i, cur)}" style="animation-delay:${i * 0.15}s"><text class="dg-t" x="8" y="${y + 17}">${esc(b.label)}</text>`
      + `<rect class="dg-track" x="140" y="${y}" width="440" height="22" rx="6"/>`
      + `<rect class="dg-grow" style="animation-delay:${i * 0.25}s" x="140" y="${y}" width="${w}" height="22" rx="6"/>`
      + `<text class="dg-s" x="${140 + w + 8}" y="${y + 16}">${esc(b.note)}</text></g>`;
  });
  return s + '</svg>';
}

/* ---------- map: explicit boxes/links inside an optional cluster ---------- */
function renderMap(spec, cur, uid) {
  const h = spec.h || (spec.cluster ? spec.cluster.y + spec.cluster.h + 8 : 230);
  let s = svgOpen(h, spec.title);
  s += ARROW(`dg-arr-${uid}`);
  if (spec.cluster) {
    s += `<g class="dg-box dg-cluster dg-pop${stCls(spec.cluster.stage ?? 0, cur)}" style="animation-delay:.1s"><rect x="${spec.cluster.x}" y="${spec.cluster.y}" width="${spec.cluster.w}" height="${spec.cluster.h}" rx="10"/><text class="dg-s" x="${spec.cluster.x + 12}" y="${spec.cluster.y + 18}">${esc(spec.cluster.label)}</text></g>`;
  }
  for (const l of spec.links || []) {
    s += `<path class="dg-line ${l.march ? 'dg-march' : 'dg-draw'}${stCls(l.stage ?? 0, cur)}"${l.march ? '' : ` style="animation-delay:${0.3 + (l.stage ?? 0) * 0.3}s" pathLength="100"`} d="${l.d}" marker-end="url(#dg-arr-${uid})"/>`;
  }
  if (spec.sweep) {
    s += `<rect class="dg-sweep" x="${spec.sweep.x}" y="${spec.sweep.y}" width="${spec.sweep.w}" height="${spec.sweep.h}" rx="6"/>`;
  }
  for (const b of spec.boxes) {
    s += box(b.x, b.y, b.w, b.h, b.label, b.sub || '', b.stage ?? 0, cur, 0.15 + (b.stage ?? 0) * 0.3, !!b.topLabel);
  }
  return s + '</svg>';
}

/* ---------- the three originals, hand-built, kept as-is ---------- */
function requestFlow() {
  return `<svg class="dg" viewBox="0 0 600 210" role="img" aria-label="How a page loads: browser, DNS, TCP and TLS, server, and the page coming back">
  ${ARROW('dg-arr-flow')}
  ${step(68, '1', 0)}${step(223, '2', .35)}${step(378, '3', .7)}${step(535, '4', 1.05)}
  ${box(8, 58, 120, 52, 'Browser', 'you type the URL')}
  ${box(168, 58, 110, 52, 'DNS', 'name → IP address')}
  ${box(318, 58, 120, 52, 'TCP + TLS', 'secure connection')}
  ${box(478, 58, 114, 52, 'Server', 'finds the page')}
  <path class="dg-line dg-draw" style="animation-delay:.2s" pathLength="100" d="M128 84 H168" marker-end="url(#dg-arr-flow)"/>
  <path class="dg-line dg-draw" style="animation-delay:.55s" pathLength="100" d="M278 84 H318" marker-end="url(#dg-arr-flow)"/>
  <path class="dg-line dg-draw" style="animation-delay:.9s" pathLength="100" d="M438 84 H478" marker-end="url(#dg-arr-flow)"/>
  <path class="dg-line dg-draw" style="animation-delay:1.25s" pathLength="100" d="M535 110 V168 H68 V110" marker-end="url(#dg-arr-flow)"/>
  <text class="dg-s" x="300" y="192" text-anchor="middle">the page comes back: HTML, CSS, JS</text>
</svg>`;
}

function jvmMemory() {
  return `<svg class="dg" viewBox="0 0 600 210" role="img" aria-label="JVM memory: metaspace on top, heap below split into young generation (Eden and two survivor spaces) and old generation; survivors age into the old generation">
  ${ARROW('dg-arr-jvm')}
  <g class="dg-box"><rect x="8" y="8" width="584" height="30" rx="8"/><text class="dg-t" x="300" y="27" text-anchor="middle">Metaspace — class data, methods</text></g>
  <g class="dg-box"><rect x="8" y="52" width="584" height="104" rx="8" class="dg-heap"/></g>
  <g class="dg-box"><rect x="16" y="64" width="200" height="80" rx="6"/><text class="dg-t" x="116" y="96" text-anchor="middle">Eden</text><text class="dg-s" x="116" y="114" text-anchor="middle">new objects land here</text></g>
  <rect class="dg-sweep" x="16" y="64" width="36" height="80" rx="6"/>
  <g class="dg-box"><rect x="224" y="64" width="64" height="80" rx="6"/><text class="dg-t" x="256" y="105" text-anchor="middle">S0</text></g>
  <g class="dg-box"><rect x="296" y="64" width="64" height="80" rx="6"/><text class="dg-t" x="328" y="105" text-anchor="middle">S1</text></g>
  <text class="dg-s" x="188" y="152" text-anchor="middle">young generation</text>
  <g class="dg-box"><rect x="376" y="64" width="208" height="80" rx="6"/><text class="dg-t" x="480" y="96" text-anchor="middle">Old generation</text><text class="dg-s" x="480" y="114" text-anchor="middle">long-lived objects</text></g>
  <path class="dg-line dg-draw" style="animation-delay:.4s" pathLength="100" d="M116 168 C 220 196, 380 196, 472 168" marker-end="url(#dg-arr-jvm)"/>
  <text class="dg-s" x="300" y="204" text-anchor="middle">survives a few collections → moves here</text>
</svg>`;
}

function k8sObjects() {
  return `<svg class="dg" viewBox="0 0 600 230" role="img" aria-label="Kubernetes: a cluster holds a control plane and a node; a Deployment keeps three pods running behind a Service">
  ${ARROW('dg-arr-k8s')}
  <g class="dg-box dg-cluster"><rect x="8" y="8" width="584" height="214" rx="10"/><text class="dg-s" x="20" y="24">Cluster</text></g>
  <g class="dg-box"><rect x="20" y="30" width="560" height="40" rx="8"/><text class="dg-t" x="300" y="54" text-anchor="middle">Control plane — API server · scheduler · etcd</text></g>
  <g class="dg-box"><rect x="20" y="82" width="560" height="132" rx="8"/><text class="dg-s" x="32" y="100">Node — kubelet</text></g>
  <text class="dg-s" x="300" y="112" text-anchor="middle">Deployment → ReplicaSet keeps 3 copies running</text>
  <g class="dg-box"><rect x="252" y="122" width="96" height="34" rx="8"/><text class="dg-t" x="300" y="143" text-anchor="middle">Service</text></g>
  <path class="dg-line dg-march" d="M300 156 V172" marker-end="url(#dg-arr-k8s)"/>
  <path class="dg-line dg-march" d="M300 156 L96 172" marker-end="url(#dg-arr-k8s)"/>
  <path class="dg-line dg-march" d="M300 156 L504 172" marker-end="url(#dg-arr-k8s)"/>
  <g class="dg-box dg-pop" style="animation-delay:.2s"><rect x="40" y="172" width="104" height="30" rx="8"/><text class="dg-t" x="92" y="191" text-anchor="middle">Pod 1</text></g>
  <g class="dg-box dg-pop" style="animation-delay:.45s"><rect x="248" y="172" width="104" height="30" rx="8"/><text class="dg-t" x="300" y="191" text-anchor="middle">Pod 2</text></g>
  <g class="dg-box dg-pop" style="animation-delay:.7s"><rect x="456" y="172" width="104" height="30" rx="8"/><text class="dg-t" x="508" y="191" text-anchor="middle">Pod 3</text></g>
</svg>`;
}

// The step captions for the three originals. Their SVGs predate the stage
// system, so stepping them changes the caption, not the highlight.
const CUSTOM = {
  'web-fundamentals': {
    title: 'How a page loads', svg: requestFlow,
    caption: 'Four steps, every time: the name is resolved, a secure connection opens, the server finds the page, and the page comes back.',
    steps: [
      'The browser asks DNS where the site lives.',
      'TCP + TLS open a secure connection to that address.',
      'The server finds the page you asked for.',
      'The page comes back: HTML, CSS, JS — and the browser renders it.',
    ],
  },
  jvm: {
    title: 'Where objects live', svg: jvmMemory,
    caption: 'New objects land in Eden. The sweep is the collector: most die young, the survivors age into the old generation. Each thread also has its own stack for method calls and local variables.',
    steps: [
      'Metaspace holds class data and methods — not your objects.',
      'New objects land in Eden. The sweep is the collector: most die young.',
      'Survivors age through S0 and S1 into the old generation, where collections are rare and expensive.',
    ],
  },
  k8s: {
    title: 'What runs where', svg: k8sObjects,
    caption: 'You talk to the Service, never to a pod directly. If a pod dies, the ReplicaSet starts another one and the Service keeps pointing at the healthy set.',
    steps: [
      'The control plane decides what should run — API server, scheduler, etcd.',
      'The Service is the stable address. You talk to it, never to a pod directly.',
      'Pods come and go. The ReplicaSet keeps three running, and the Service keeps pointing at the healthy set.',
    ],
  },
};

function renderSpec(spec, cur, uid) {
  switch (spec.kind) {
    case 'flow': return renderFlow(spec, cur, uid, spec.ret);
    case 'state': return renderFlow(spec, cur, uid, spec.ret);
    case 'layers': return renderLayers(spec, cur);
    case 'stack': return renderStack(spec, cur);
    case 'cycle': return renderCycle(spec, cur, uid);
    case 'split': return renderSplit(spec, cur);
    case 'tree': return renderTree(spec, cur, uid);
    case 'bars': return renderBars(spec, cur);
    case 'map': return renderMap(spec, cur, uid);
    default: return '';
  }
}

function renderDiagram(topicId, stage) {
  const custom = CUSTOM[topicId];
  if (custom) return { title: custom.title, svg: custom.svg(), caption: custom.caption, steps: custom.steps };
  const spec = SPECS[topicId];
  if (!spec) return null;
  const uid = topicId.replace(/[^a-z0-9]+/g, '-');
  return { title: spec.title, svg: renderSpec(spec, stage ?? null, uid), caption: spec.caption, steps: spec.steps };
}

export function diagramFor(topicId) {
  const d = renderDiagram(topicId, null);
  if (!d) return null;
  return { title: d.title, svg: d.svg, caption: d.caption, steps: d.steps, stageCount: d.steps.length };
}

// stage: null = the full diagram; a number = that step, with the rest dimmed.
// The player controls step through the stages; Replay re-renders the full
// diagram, which restarts the draw-in.
export function diagramHtml(topicId, stage = null) {
  const d = renderDiagram(topicId, stage);
  if (!d) return '';
  const cap = stage === null || stage === undefined ? d.caption : (d.steps[stage] || d.caption);
  const n = d.steps.length;
  return `<figure class="diagram" data-dg="${esc(topicId)}"><div class="label">${esc(d.title)}</div>${d.svg}`
    + `<figcaption>${esc(cap)}</figcaption>`
    + `<div class="dg-controls">`
    + `<button class="btn quiet small" type="button" data-act="dgprev" data-id="${esc(topicId)}" ${stage === null || stage === undefined ? 'disabled' : ''}>‹ Back</button>`
    + `<span class="dg-stage">${esc(stageLabel(stage, n))}</span>`
    + `<button class="btn quiet small" type="button" data-act="dgnext" data-id="${esc(topicId)}" ${stage === n - 1 ? 'disabled' : ''}>Next ›</button>`
    + `<button class="btn quiet small" type="button" data-act="dgreplay" data-id="${esc(topicId)}">Replay</button>`
    + `</div></figure>`;
}
