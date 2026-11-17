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
