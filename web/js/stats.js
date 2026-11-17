// Practice activity, kept deliberately small: one count per day, on this
// device only. No history is invented — the log starts the first day the
// user grades a card, and days before that simply show as no practice.
export function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function keyOf(d) { return todayKey(d); }

// Record one graded card. Returns a new log (the old one is not mutated);
// only the last 90 days are kept.
export function recordActivity(log, key, ok) {
  const next = { ...(log || {}) };
  const day = next[key] || { graded: 0, known: 0 };
  next[key] = { graded: day.graded + 1, known: day.known + (ok ? 1 : 0) };
  const keys = Object.keys(next).sort();
  while (keys.length > 90) delete next[keys.shift()];
  return next;
}

// Consecutive days with at least one graded card, ending today — or
// yesterday, if today has no practice yet (the streak is still alive).
export function streakDays(log, today = todayKey()) {
  const l = log || {};
  let streak = 0;
  const d = new Date(today + 'T12:00:00');
  if (!(l[today]?.graded > 0)) d.setDate(d.getDate() - 1);
  while (l[keyOf(d)]?.graded > 0) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// The last n days ending today, oldest first, each with its counts.
export function lastNDays(log, n, today = todayKey()) {
  const l = log || {};
  const out = [];
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const key = keyOf(d);
    const day = l[key] || { graded: 0, known: 0 };
    out.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), graded: day.graded, known: day.known });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
