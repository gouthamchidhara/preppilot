// Study content: role catalog, pack manifest, and on-demand pack loading.
// Only the packs a user's role needs are downloaded; the service worker keeps them for offline use.
import { attachWeights, effectiveRoles } from './plan.js';
import { registerDiagramMeaning } from './diagrams.js';

// Lesson flow (web/content/flow/<pack>.json): the order cards are met in, a line on each card
// pulling the reader to the next one, a teaser for the next topic, and which cards are basics.
// Only concepts are reordered; flashcard questions (and the progress keyed on them) never move.
export function applyFlow(t, f) {
  const n = t.concepts.length;
  if (!f || !Array.isArray(f.order) || f.order.length !== n || new Set(f.order).size !== n || f.order.some(i => !(i >= 0 && i < n))) return t;
  const basics = new Set(f.basics || []);
  const concepts = f.order.map((i, k) => ({ ...t.concepts[i], hook: f.hooks?.[k] || '', basic: basics.has(i) }));
  return { ...t, concepts, upNext: f.upNext || '' };
}

let catalog = { families: [], roles: [] };
let manifest = { packs: [] };
const loaded = new Map(); // packId -> topics (with role weights attached)
const meta = new Map(); // topicId -> { id, name, blurb, beta, pack }

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function initContent() {
  [catalog, manifest] = await Promise.all([getJson('content/roles.json'), getJson('content/packs/index.json')]);
  for (const p of manifest.packs) for (const t of p.topics) meta.set(t.id, { ...t, pack: p.id });
}

export const getCatalog = () => catalog;
export const getManifest = () => manifest;
export const roleById = id => catalog.roles.find(r => r.id === id);
export const topicMeta = id => meta.get(id);

// Topic IDs a profile needs: selected roles' topics, extras, self-rated topics, behavioral.
export function topicIdsFor(profile) {
  const roleTopics = effectiveRoles(profile).flatMap(id => Object.keys(roleById(id)?.topics || {}));
  return new Set([...roleTopics, ...(profile?.extras || []), ...(profile?.weak || []), ...(profile?.strong || []), 'behavioral']);
}

export async function ensureTopics(ids) {
  const packs = new Set([...ids].map(id => meta.get(id)?.pack).filter(Boolean));
  await Promise.all([...packs].filter(id => !loaded.has(id)).map(async id => {
    const p = manifest.packs.find(x => x.id === id);
    const [data, flow, meaning, field] = await Promise.all([
      getJson(`content/packs/${id}.json?v=${p.version}`),
      getJson(`content/flow/${id}.json?v=${p.version}`).catch(() => ({})),
      getJson(`content/meaning/${id}.json?v=${p.version}`).catch(() => ({})),
      getJson(`content/field/${id}.json?v=${p.version}`).catch(() => ({})),
    ]);
    for (const [tid, m] of Object.entries(meaning)) registerDiagramMeaning(tid, m);
    loaded.set(id, attachWeights(data.topics.map(t => ({ ...applyFlow(t, flow[t.id]), ...(field[t.id] ? { field: field[t.id] } : {}) })), catalog));
  }));
}

export const ensureForProfile = profile => ensureTopics(topicIdsFor(profile));
export const loadedTopics = () => [...loaded.values()].flat();

export function reportUrl(topic, where) {
  const title = `Content problem: ${topic.name}`;
  const body = `Topic: ${topic.id}\nWhere: ${where}\n\nWhat's wrong:\n`;
  return `https://github.com/gouthamchidhara/preppilot/issues/new?labels=content&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
