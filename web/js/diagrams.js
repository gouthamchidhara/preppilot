// Animated concept diagrams: small inline SVGs that show how something works.
// One per topic, shown at the top of the first lesson. Motion is slow and explains
// the flow — lines draw in order, objects age, pods appear — never decoration.
// Every animation ends in its final, fully drawn state, so the reduced-motion
// rule in app.css (which collapses animations to their end state) leaves a
// complete static diagram. No assets, no Blob storage: inline SVG is enough
// for this first increment. Richer animated assets (Lottie, video) can live in
// Blob Storage later and slot into the same diagramFor() shape.
const ARROW = id => `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" style="fill:var(--muted)"/></marker></defs>`;

const box = (x, y, w, h, label, sub, cls = '') =>
  `<g class="dg-box ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
  + `<text class="dg-t" x="${x + w / 2}" y="${y + (sub ? h / 2 - 2 : h / 2 + 5)}" text-anchor="middle">${label}</text>`
  + (sub ? `<text class="dg-s" x="${x + w / 2}" y="${y + h / 2 + 16}" text-anchor="middle">${sub}</text>` : '') + `</g>`;

const step = (cx, label, delay) =>
  `<g class="dg-step" style="animation-delay:${delay}s"><circle cx="${cx}" cy="36" r="11"/><text class="dg-n" x="${cx}" y="40" text-anchor="middle">${label}</text></g>`;

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

const DIAGRAMS = {
  'web-fundamentals': {
    title: 'How a page loads',
    svg: requestFlow,
    caption: 'Four steps, every time: the name is resolved, a secure connection opens, the server finds the page, and the page comes back.',
  },
  jvm: {
    title: 'Where objects live',
    svg: jvmMemory,
    caption: 'New objects land in Eden. The sweep is the collector: most die young, the survivors age into the old generation. Each thread also has its own stack for method calls and local variables.',
  },
  k8s: {
    title: 'What runs where',
    svg: k8sObjects,
    caption: 'You talk to the Service, never to a pod directly. If a pod dies, the ReplicaSet starts another one and the Service keeps pointing at the healthy set.',
  },
};

export function diagramFor(topicId) {
  const d = DIAGRAMS[topicId];
  if (!d) return null;
  return { title: d.title, svg: d.svg(), caption: d.caption };
}

export function diagramHtml(topicId) {
  const d = diagramFor(topicId);
  if (!d) return '';
  return `<figure class="diagram"><div class="label">${d.title}</div>${d.svg}<figcaption>${d.caption}</figcaption></figure>`;
}
