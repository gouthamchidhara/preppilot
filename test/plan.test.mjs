import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, rankTopics, review, dueCards, readiness, daysUntil, INTERVAL_DAYS } from '../web/js/plan.js';

const mk = (id, roles, nConcepts = 3, tiers = [1, 2, 3]) => ({
  id, name: id, roles,
  concepts: Array.from({ length: nConcepts }, (_, i) => ({ t: `${id}${i}`, what: 'x' })),
  qa: tiers.map(l => ({ l, q: `${id} q${l}`, a: 'a' })),
});
const TOPICS = [mk('linux', { infra: 3, devops: 2 }), mk('k8s', { infra: 1, devops: 3 }), mk('windows', { infra: 3, devops: 1 })];
const NOW = Date.parse('2026-11-16T12:00:00Z');
const DAY = 86400000;

test('ranking follows target role, and self-rated weak topics move up', () => {
  assert.equal(rankTopics(TOPICS, { role: 'devops' })[0].id, 'k8s');
  assert.equal(rankTopics(TOPICS, { role: 'infra', weak: ['windows'] })[0].id, 'windows');
  assert.notEqual(rankTopics(TOPICS, { role: 'infra', strong: ['linux'] })[0].id, 'linux');
});

test('plan fits the days until the interview and ends with a mock day', () => {
  const p = { role: 'infra', interviewDate: new Date(NOW + 10 * DAY).toISOString().slice(0, 10) };
  const plan = buildPlan(TOPICS, p, NOW);
  assert.equal(plan.length, daysUntil(p.interviewDate, NOW));
  assert.equal(plan.at(-1).kind, 'mock');
  const covered = new Set(plan.flatMap(d => d.topics));
  for (const t of TOPICS) assert.ok(covered.has(t.id), `${t.id} missing from plan`);
});

test('plan without a date defaults to 28 days and never below 3', () => {
  assert.equal(buildPlan(TOPICS, { role: 'infra' }, NOW).length, 28);
  const tomorrow = new Date(NOW + DAY).toISOString().slice(0, 10);
  assert.equal(buildPlan(TOPICS, { role: 'infra', interviewDate: tomorrow }, NOW).length, 3);
});

test('spaced repetition: correct moves up a box, a miss resets to due now', () => {
  let s = review(undefined, true, NOW);
  assert.equal(s.box, 1);
  assert.equal(s.due, NOW + INTERVAL_DAYS[1] * DAY);
  s = review(s, true, NOW);
  assert.equal(s.box, 2);
  s = review(s, false, NOW);
  assert.deepEqual([s.box, s.due], [0, NOW]);
});

test('due cards respect level tiers and put missed cards first', () => {
  const junior = dueCards(TOPICS, { role: 'infra', level: 'junior' }, {}, NOW);
  assert.ok(junior.every(c => c.l <= 2));
  const progress = { 'linux-0': { box: 3, due: NOW + 5 * DAY }, 'k8s-1': { box: 0, due: NOW - 1 } };
  const cards = dueCards(TOPICS, { role: 'infra', level: 'senior' }, progress, NOW);
  assert.ok(!cards.some(c => c.id === 'linux-0'));
  assert.equal(readiness(TOPICS, { level: 'senior' }, progress).known, 1);
});
