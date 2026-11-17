import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, recordActivity, streakDays, lastNDays } from '../web/js/stats.js';

test('recordActivity counts graded cards per day and keeps the log small', () => {
  let log = recordActivity({}, '2026-11-17', true);
  assert.deepEqual(log, { '2026-11-17': { graded: 1, known: 1 } });
  log = recordActivity(log, '2026-11-17', false);
  assert.deepEqual(log['2026-11-17'], { graded: 2, known: 1 });
  log = recordActivity(log, '2026-11-18', true);
  assert.equal(log['2026-11-18'].graded, 1);
  // 91 days of history prunes back to 90.
  let big = {};
  for (let i = 0; i < 91; i++) big = recordActivity(big, `2026-08-${String((i % 28) + 1).padStart(2, '0')}`, true);
  assert.ok(Object.keys(big).length <= 90);
});

test('todayKey uses the local date', () => {
  assert.match(todayKey(new Date(2026, 10, 17)), /^2026-11-17$/);
});

test('streakDays counts consecutive practice days, alive through today', () => {
  const log = {
    '2026-11-14': { graded: 3, known: 2 },
    '2026-11-15': { graded: 1, known: 1 },
    '2026-11-16': { graded: 2, known: 2 },
  };
  assert.equal(streakDays(log, '2026-11-16'), 3);
  // Today has no practice yet, but yesterday did — the streak is still 3.
  assert.equal(streakDays(log, '2026-11-17'), 3);
  // A gap day breaks it.
  assert.equal(streakDays(log, '2026-11-18'), 0);
  assert.equal(streakDays({}, '2026-11-17'), 0);
  // A single practice day is a streak of 1.
  assert.equal(streakDays({ '2026-11-17': { graded: 1, known: 0 } }, '2026-11-17'), 1);
});

test('lastNDays returns the last n days, oldest first, with zeroes for gaps', () => {
  const log = { '2026-11-15': { graded: 4, known: 3 }, '2026-11-17': { graded: 1, known: 1 } };
  const days = lastNDays(log, 3, '2026-11-17');
  assert.deepEqual(days.map(d => d.key), ['2026-11-15', '2026-11-16', '2026-11-17']);
  assert.deepEqual(days.map(d => d.graded), [4, 0, 1]);
  assert.equal(days[0].label, 'Sun');
});
