// "Fresh from the field": one real-world scenario per role, rewritten every 6 hours.
// Generated lazily: the first request after the 6 hours are up writes the next one; everyone
// else reads the stored copy. If the AI call fails, the previous scenario keeps being served.
import { readFileSync } from 'node:fs';
import { complete } from './llm.js';
import { getDb } from './db.js';

const ROLES = JSON.parse(readFileSync(new URL('./roles.json', import.meta.url))).roles;
export const FRESH_TTL_MS = Number(process.env.FRESH_TTL_HOURS || 6) * 3600000;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export const ROLE_LIST = ROLES;
export function roleById(id) { return ROLES.find(r => r.id === id) || null; }

export function sanitizeFresh(raw) {
  let d;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  const out = {
    title: str(d?.title, 90),
    situation: str(d?.situation, 420),
    question: str(d?.question, 220),
    points: (Array.isArray(d?.points) ? d.points : []).map(p => str(p, 200)).filter(Boolean).slice(0, 5),
    analogy: str(d?.analogy, 220),
  };
  return out.title && out.situation && out.question && out.points.length >= 2 ? out : null;
}

const prompt = (role, avoid) => [
  { role: 'system', content: 'You write short, realistic interview scenarios for tech job seekers. Facts must be accurate. Plain English, no emoji, no exclamation marks. Reply with JSON only.' },
  { role: 'user', content: `Role: ${role.name}.
Write one scenario that an interviewer for this role could realistically ask about this week: an incident, a design decision or a trade-off from real work, not a definition.
Return JSON: {"title": max 80 chars, "situation": 2-3 sentences setting the scene, "question": the interviewer's question, "points": 3-5 strings, the points a strong answer covers in order, "analogy": one sentence everyday analogy that makes the core idea stick}.
${avoid.length ? `Do not repeat these recent titles: ${avoid.join(' | ')}.` : ''}` },
];

export async function freshFor(roleId, now = Date.now(), gen = complete) {
  const role = roleById(roleId);
  if (!role) return null;
  const db = await getDb();
  const cur = await db.get('fresh', role.id);
  if (cur?.item && now - cur.at < FRESH_TTL_MS) return { ...cur.item, at: cur.at, role: role.name };
  // Claim the refresh so a burst of requests produces one AI call, not many.
  let claimed = false;
  await db.update('fresh', role.id, r => {
    if (r?.claim && now - r.claim < 60000) return undefined;
    claimed = true;
    return { ...(r || {}), claim: now };
  });
  if (claimed) {
    try {
      const item = sanitizeFresh(await gen(prompt(role, cur?.recent || []), { json: true, maxTokens: 600, temperature: 0.8 }));
      if (item) {
        await db.update('fresh', role.id, () => ({ item, at: now, claim: 0, recent: [item.title, ...(cur?.recent || [])].slice(0, 12) }));
        return { ...item, at: now, role: role.name };
      }
    } catch { /* keep serving the last one */ }
    await db.update('fresh', role.id, r => ({ ...(r || {}), claim: 0 }));
  }
  return cur?.item ? { ...cur.item, at: cur.at, role: role.name } : null;
}
