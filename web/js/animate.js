// Pure helpers for the animated bits (diagram player, score ring, count-ups),
// kept free of the DOM so they can be unit-tested.

// A progress ring is a circle with pathLength 100: dashoffset 100 = empty,
// 0 = full. Clamped, so a bad percentage cannot draw outside the ring.
export function ringOffset(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return 100 - p;
}

// Diagram player: stage is null for the full diagram, otherwise an index.
// Next from the full view opens step 1; Prev from step 1 returns to full.
export function nextStage(stage, n) {
  if (stage === null || stage === undefined) return 0;
  return Math.min(stage + 1, n - 1);
}

export function prevStage(stage) {
  if (stage === null || stage === undefined || stage === 0) return null;
  return stage - 1;
}

export function stageLabel(stage, n) {
  if (stage === null || stage === undefined) return 'Full diagram';
  return `Step ${stage + 1} of ${n}`;
}

// The narrative arc of a lesson: first card hooks, middle cards build,
// last card pays off.
export function sceneName(ci, total) {
  if (Math.max(1, total || 1) <= 1) return 'The whole story';
  if (ci <= 0) return 'The hook';
  if (ci >= Math.max(1, total || 1) - 1) return 'The payoff';
  return 'The build-up';
}

// The same build-up, counted in diagram pieces instead of stages: how many
// pieces this card has unlocked, and which one is fresh (just unlocked) so
// only it pops in. built is at least 1; the last card builds everything.
export function storyPieces(ci, total, pieces) {
  const n = Math.max(1, total || 1);
  const p = Math.max(1, pieces || 1);
  const built = Math.min(p, Math.max(1, Math.round(((ci + 1) * p) / n)));
  const prev = ci === 0 ? 0 : Math.min(p, Math.max(1, Math.round((ci * p) / n)));
  const fresh = built > prev ? (built === p && ci === 0 ? 'all' : built - 1) : null;
  return { built, fresh };
}
