// Personalization and spaced repetition. Pure functions: no DOM, no storage.
// Topic relevance comes from the role catalog (web/content/roles.json): attachWeights() copies each role's
// weight onto topic.roles at load time, so scoring stays a pure function of (topic, profile).

export const LEVELS = [
  { id: 'junior', name: 'Entry / 0-3 years', tiers: [1, 2] },
  { id: 'mid', name: 'Mid / 3-7 years', tiers: [1, 2, 3] },
  { id: 'senior', name: 'Senior / 7+ years', tiers: [1, 2, 3] },
];

const DAY = 86400000;

export function tiersFor(level) {
  return (LEVELS.find(l => l.id === level) || LEVELS[1]).tiers;
}

// Role used for scoring. "Other" roles borrow the closest listed role.
export function effectiveRole(profile) {
  const id = profile?.roleId || profile?.role || 'infra';
  return id === 'other' ? (profile?.baseRoleId || 'infra') : id;
}

export function effectiveRoles(profile) {
  const ids = Array.isArray(profile?.roleIds) ? profile.roleIds : [profile?.roleId || profile?.role || 'infra'];
  return [...new Set(ids.map(id => id === 'other' ? profile?.baseRoleId : id).filter(Boolean))];
}

// Profiles saved before the role catalog used `role`; the infra role IDs are unchanged.
export function migrateProfile(p) {
  if (!p) return p;
  const out = { ...p };
  out.roleIds = Array.isArray(out.roleIds) ? [...new Set(out.roleIds.filter(Boolean))] : [out.roleId || out.role || 'infra'];
  out.roleId = out.roleIds[0] || '';
  delete out.role;
  out.extras ||= [];
  return out;
}

export function attachWeights(topics, catalog) {
  const byTopic = {};
  for (const r of catalog?.roles || []) for (const [id, w] of Object.entries(r.topics || {})) (byTopic[id] ||= {})[r.id] = w;
  return topics.map(t => ({ ...t, roles: byTopic[t.id] || {} }));
}

export function topicWeight(topic, profile) {
  if (topic.custom || topic.private) return 2; // the user's own content always counts
  const w = Math.max(0, ...effectiveRoles(profile).map(id => topic.roles?.[id] ?? 0));
  return profile?.extras?.includes(topic.id) ? Math.max(w, 2) : w;
}

// Higher score = study earlier. Role relevance dominates; self-rated weak topics move up, strong ones down.
// Score 0 = not relevant for this role (hidden from the plan, still browsable).
export function scoreTopic(topic, profile) {
  const weight = topicWeight(topic, profile);
  if (!weight) return 0;
  let score = weight * 10;
  if (profile?.weak?.includes(topic.id)) score += 12;
  if (profile?.strong?.includes(topic.id)) score -= 8;
  if (topic.id === 'scenarios' && profile?.level === 'senior') score += 6;
  if (topic.id === 'scenarios' && profile?.level === 'junior') score -= 10;
  return score;
}

export function rankTopics(topics, profile) {
  return topics
    .map((t, i) => ({ topic: t, score: scoreTopic(t, profile), i }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(x => ({ ...x.topic, score: x.score }));
}

export function daysUntil(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const target = Date.parse(dateStr + 'T00:00:00');
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - now) / DAY));
}

// Spread ranked topics over the available days, weighting by card count,
// and reserve the last ~15% of days (min 1) for mixed review; the final day is a Live coach practice test.
export function buildPlan(topics, profile, now = Date.now()) {
  const ranked = rankTopics(topics, profile).filter(t => t.score > 0);
  const until = daysUntil(profile?.interviewDate, now);
  const total = Math.max(3, Math.min(until ?? 28, 60));
  const reviewDays = Math.max(1, Math.round(total * 0.15));
  const studyDays = Math.max(1, total - reviewDays);

  const load = t => t.concepts.length + t.qa.length / 2;
  const sum = ranked.reduce((a, t) => a + load(t), 0) || 1;
  const days = [];
  let carry = 0;
  for (const t of ranked) {
    const share = (load(t) / sum) * studyDays + carry;
    const n = Math.floor(share);
    carry = share - n;
    if (n === 0) {
      // Small topic: share a day with the previous one.
      if (days.length) days[days.length - 1].topics.push(t.id);
      else days.push({ topics: [t.id], kind: 'learn' });
      continue;
    }
    for (let k = 0; k < n; k++) days.push({ topics: [t.id], kind: 'learn' });
  }
  while (days.length > studyDays) {
    const last = days.pop();
    days[days.length - 1].topics = [...new Set([...days[days.length - 1].topics, ...last.topics])];
  }
  while (days.length < studyDays) days.push({ topics: [], kind: 'review' });
  for (let k = 0; k < reviewDays; k++) days.push({ topics: [], kind: k === reviewDays - 1 ? 'live' : 'review' });
  return days.map((d, i) => ({ ...d, day: i + 1, date: new Date(now + i * DAY).toISOString().slice(0, 10) }));
}

// Leitner boxes: box 0 = new/missed (due now), each correct answer moves up one box.
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];

export function review(state, ok, now = Date.now()) {
  const box = ok ? Math.min((state?.box ?? 0) + 1, INTERVAL_DAYS.length - 1) : 0;
  return { box, due: now + INTERVAL_DAYS[box] * DAY, seen: (state?.seen ?? 0) + 1 };
}

export function isDue(state, now = Date.now()) {
  return !state || state.due <= now;
}

export function isKnown(state) {
  return !!state && state.box >= 2;
}

// Cards the user should see now: due cards for their level, weakest topics first, capped.
// relevantOnly=false when the user explicitly picked topics (e.g. browsing a topic outside their role).
export function dueCards(topics, profile, progress, now = Date.now(), limit = 20, { relevantOnly = true } = {}) {
  const tiers = tiersFor(profile?.level);
  const ranked = relevantOnly ? rankTopics(topics, profile) : topics;
  const out = [];
  for (const t of ranked) {
    t.qa.forEach((q, i) => {
      const id = `${t.id}-${i}`;
      if (tiers.includes(q.l) && isDue(progress[id], now)) out.push({ id, topic: t.id, ...q, box: progress[id]?.box ?? 0 });
    });
  }
  // Missed/new first (box 0), then by topic priority (already ordered).
  out.sort((a, b) => a.box - b.box);
  return out.slice(0, limit);
}

export function readiness(topics, profile, progress) {
  const tiers = tiersFor(profile?.level);
  let n = 0, k = 0;
  for (const t of topics) t.qa.forEach((q, i) => {
    if (!tiers.includes(q.l)) return;
    n++;
    if (isKnown(progress[`${t.id}-${i}`])) k++;
  });
  return { known: k, total: n, pct: n ? Math.round((k * 100) / n) : 0 };
}

// A visual map of what the user knows, per topic, instead of one percentage.
// state: strong (at least 80% of cards known), ok (50-79%), weak (some known,
// under 50%), unseen (no card attempted yet, or no cards at this level).
export function knowledgeMap(topics, profile, progress) {
  const tiers = tiersFor(profile?.level);
  const out = topics.map(t => {
    let total = 0, known = 0, attempted = 0;
    t.qa.forEach((q, i) => {
      if (!tiers.includes(q.l)) return;
      total++;
      const st = progress[`${t.id}-${i}`];
      if (st) attempted++;
      if (isKnown(st)) known++;
    });
    const pct = total ? Math.round((known * 100) / total) : 0;
    const state = total === 0 || attempted === 0 ? 'unseen' : pct >= 80 ? 'strong' : pct >= 50 ? 'ok' : 'weak';
    return { id: t.id, name: t.name || t.id, state, known, total, pct };
  });
  const counts = { strong: 0, ok: 0, weak: 0, unseen: 0 };
  out.forEach(t => counts[t.state]++);
  return { topics: out, counts };
}

// roleName/topicName come from the catalog and loaded packs (kept out of this pure module).
export function profileSummary(profile, { roleName = id => id, topicName = id => id } = {}) {
  if (!profile) return 'No profile.';
  const p = migrateProfile(profile);
  const role = p.roleIds.map(id => id === 'other' ? `${p.otherRole || 'Other'} (closest listed role: ${roleName(p.baseRoleId)})` : roleName(id)).join(', ');
  const level = LEVELS.find(l => l.id === p.level)?.name || p.level;
  const parts = [`Target ${p.roleIds.length === 1 ? 'role' : 'roles'}: ${role}.`, `Level: ${level}.`];
  if (p.extras?.length) parts.push(`Also uses: ${p.extras.map(topicName).join(', ')}.`);
  if (p.background) parts.push(`Background: ${p.background}`);
  if (p.goal) parts.push(`Goal: ${p.goal}`);
  if (p.strong?.length) parts.push(`Self-rated strong: ${p.strong.map(topicName).join(', ')}.`);
  if (p.weak?.length) parts.push(`Self-rated weak: ${p.weak.map(topicName).join(', ')}.`);
  if (p.interviewDate) parts.push(`Interview date: ${p.interviewDate}.`);
  return parts.join(' ');
}
