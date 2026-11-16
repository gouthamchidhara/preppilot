// Study content: role catalog, pack manifest, and on-demand pack loading.
// Only the packs a user's role needs are downloaded; the service worker keeps them for offline use.
import { attachWeights, effectiveRole } from './plan.js';

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

// Topic IDs a profile needs: the role's topics, chosen extras, self-rated topics, behavioral.
export function topicIdsFor(profile) {
  const role = roleById(effectiveRole(profile));
  return new Set([...Object.keys(role?.topics || {}), ...(profile?.extras || []), ...(profile?.weak || []), ...(profile?.strong || []), 'behavioral']);
}

export async function ensureTopics(ids) {
  const packs = new Set([...ids].map(id => meta.get(id)?.pack).filter(Boolean));
  await Promise.all([...packs].filter(id => !loaded.has(id)).map(async id => {
    const p = manifest.packs.find(x => x.id === id);
    const data = await getJson(`content/packs/${id}.json?v=${p.version}`);
    loaded.set(id, attachWeights(data.topics, catalog));
  }));
}

export const ensureForProfile = profile => ensureTopics(topicIdsFor(profile));
export const loadedTopics = () => [...loaded.values()].flat();

export function reportUrl(topic, where) {
  const title = `Content problem: ${topic.name}`;
  const body = `Topic: ${topic.id}\nWhere: ${where}\n\nWhat's wrong:\n`;
  return `https://github.com/gouthamchidhara/preppilot/issues/new?labels=content&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
