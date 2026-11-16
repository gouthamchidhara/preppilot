// Personalization and spaced repetition. Pure functions: no DOM, no storage.

export const ROLES = [
  { id: 'infra', name: 'Infrastructure / Systems engineer' },
  { id: 'sre', name: 'SRE / Production engineering' },
  { id: 'cloud', name: 'Cloud engineer / architect' },
  { id: 'devops', name: 'DevOps / Platform engineer' },
  { id: 'network', name: 'Network engineer' },
  { id: 'support', name: 'IT support / Operations' },
];

export const LEVELS = [
  { id: 'junior', name: 'Entry / 0-3 years', tiers: [1, 2] },
  { id: 'mid', name: 'Mid / 3-7 years', tiers: [1, 2, 3] },
  { id: 'senior', name: 'Senior / 7+ years', tiers: [1, 2, 3] },
];

const DAY = 86400000;

export function tiersFor(level) {
  return (LEVELS.find(l => l.id === level) || LEVELS[1]).tiers;
}

// Higher score = study earlier. Role relevance dominates; self-rated weak topics move up, strong ones down.
export function scoreTopic(topic, profile) {
  const role = profile?.role || 'infra';
  const weight = topic.roles?.[role] ?? 2;
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
// and reserve the last ~15% of days (min 1) for mixed review and mock interviews.
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
  for (let k = 0; k < reviewDays; k++) days.push({ topics: [], kind: k === reviewDays - 1 ? 'mock' : 'review' });
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
export function dueCards(topics, profile, progress, now = Date.now(), limit = 20) {
  const tiers = tiersFor(profile?.level);
  const ranked = rankTopics(topics, profile);
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

export function profileSummary(profile) {
  if (!profile) return 'No profile.';
  const role = ROLES.find(r => r.id === profile.role)?.name || profile.role;
  const level = LEVELS.find(l => l.id === profile.level)?.name || profile.level;
  const parts = [`Target role: ${role}.`, `Level: ${level}.`];
  if (profile.background) parts.push(`Background: ${profile.background}`);
  if (profile.goal) parts.push(`Goal: ${profile.goal}`);
  if (profile.strong?.length) parts.push(`Self-rated strong: ${profile.strong.join(', ')}.`);
  if (profile.weak?.length) parts.push(`Self-rated weak: ${profile.weak.join(', ')}.`);
  if (profile.interviewDate) parts.push(`Interview date: ${profile.interviewDate}.`);
  return parts.join(' ');
}
