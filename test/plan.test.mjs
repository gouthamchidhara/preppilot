import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, rankTopics, review, isKnown, dueCards, readiness, knowledgeMap, daysUntil, INTERVAL_DAYS, effectiveRoles, migrateProfile, profileSummary, topicWeight } from '../web/js/plan.js';

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

test('plan fits the days until the interview and ends with a live coach day', () => {
  const p = { role: 'infra', interviewDate: new Date(NOW + 10 * DAY).toISOString().slice(0, 10) };
  const plan = buildPlan(TOPICS, p, NOW);
  assert.equal(plan.length, daysUntil(p.interviewDate, NOW));
  assert.equal(plan.at(-1).kind, 'live');
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

test('one correct grade counts as known, so the home count moves at once', () => {
  assert.equal(isKnown(undefined), false);
  assert.equal(isKnown({ box: 0, due: NOW }), false);
  // Grading a fresh card "Got it" once moves box 0 -> 1 — and that is known.
  assert.equal(isKnown(review(undefined, true, NOW)), true);
  const progress = { 'linux-0': review(undefined, true, NOW) };
  assert.equal(readiness(TOPICS, { level: 'senior' }, progress).known, 1);
});

test('due cards respect level tiers and put missed cards first', () => {
  const junior = dueCards(TOPICS, { role: 'infra', level: 'junior' }, {}, NOW);
  assert.ok(junior.every(c => c.l <= 2));
  const progress = { 'linux-0': { box: 3, due: NOW + 5 * DAY }, 'k8s-1': { box: 0, due: NOW - 1 } };
  const cards = dueCards(TOPICS, { role: 'infra', level: 'senior' }, progress, NOW);
  assert.ok(!cards.some(c => c.id === 'linux-0'));
  assert.equal(readiness(TOPICS, { level: 'senior' }, progress).known, 1);
});

test('catalog: topics outside the role are hidden; extras, custom and private topics count', async () => {
  const { attachWeights, migrateProfile, effectiveRole } = await import('../web/js/plan.js');
  const catalog = { roles: [{ id: 'backend-java', topics: { 'java-core': 3, dsa: 2 } }, { id: 'infra', topics: { linux: 3 } }] };
  const raw = [{ id: 'linux', qa: [], concepts: [] }, { id: 'java-core', qa: [], concepts: [] }, { id: 'dsa', qa: [], concepts: [] }, { id: 'spark', qa: [], concepts: [] }];
  const topics = attachWeights(raw, catalog);
  const java = { roleId: 'backend-java' };
  assert.deepEqual(rankTopics(topics, java).map(t => t.id), ['java-core', 'dsa']);
  assert.deepEqual(rankTopics(topics, { ...java, extras: ['spark'] }).map(t => t.id), ['java-core', 'dsa', 'spark']);
  assert.ok(rankTopics([...topics, { id: 'c-x', custom: true, qa: [], concepts: [] }], java).some(t => t.id === 'c-x'));
  assert.equal(effectiveRole({ roleId: 'other', baseRoleId: 'backend-java' }), 'backend-java');
  // Profiles saved before the catalog keep their infra role.
  const old = migrateProfile({ role: 'sre', level: 'mid' });
  assert.equal(old.roleId, 'sre');
  assert.equal(old.role, undefined);
});

test('flashcards for an explicitly chosen topic work even when it is outside the role', () => {
  const t = [{ id: 'spark', roles: {}, concepts: [], qa: [{ l: 1, q: 'q', a: 'a' }] }];
  assert.equal(dueCards(t, { roleId: 'infra' }, {}, NOW).length, 0);
  assert.equal(dueCards(t, { roleId: 'infra' }, {}, NOW, 20, { relevantOnly: false }).length, 1);
});

test('multiple roles combine topics and questions without duplicating shared topics', () => {
  const topics = [mk('java', { java: 3 }), mk('python', { python: 3 }), mk('linux', { infra: 3 }), mk('shared', { java: 1, python: 3, infra: 2 })];
  const p = { roleIds: ['java', 'python', 'infra'], roleId: 'java', level: 'mid' };
  assert.deepEqual(new Set(rankTopics(topics, p).map(t => t.id)), new Set(['java', 'python', 'linux', 'shared']));
  assert.equal(topicWeight(topics[3], p), 3);
  const cards = dueCards(topics, p, {}, NOW, 100);
  for (const id of ['java', 'python', 'linux', 'shared']) assert.equal(cards.filter(c => c.topic === id).length, 3);
  assert.deepEqual(new Set(buildPlan(topics, p, NOW).flatMap(d => d.topics)), new Set(['java', 'python', 'linux', 'shared']));
  assert.match(profileSummary(p), /Target roles: java, python, infra/);
});

test('migration and other-role mapping preserve legacy profiles and explicit empty selections', () => {
  assert.deepEqual(migrateProfile({ roleId: 'infra' }).roleIds, ['infra']);
  assert.deepEqual(migrateProfile({ role: 'sre' }).roleIds, ['sre']);
  assert.deepEqual(migrateProfile({ roleIds: [], roleId: 'infra' }).roleIds, []);
  const p = migrateProfile({ roleIds: ['java', 'other'], baseRoleId: 'python', otherRole: 'Data developer' });
  assert.deepEqual(effectiveRoles(p), ['java', 'python']);
  assert.match(profileSummary(p), /java, Data developer \(closest listed role: python\)/);
});

test('knowledge map classifies each topic: strong, ok, weak, unseen', () => {
  // TOPICS have 3 cards each (tiers 1, 2, 3). Senior sees all three.
  const progress = {
    'linux-0': { box: 2, due: NOW }, 'linux-1': { box: 3, due: NOW }, 'linux-2': { box: 2, due: NOW }, // 3/3 known
    'k8s-0': { box: 2, due: NOW }, 'k8s-1': { box: 0, due: NOW }, // 1/3 known, 2 attempted (box 0 = tried, missed, not known)
    // windows: nothing attempted
  };
  const map = knowledgeMap(TOPICS, { role: 'infra', level: 'senior' }, progress);
  const byId = Object.fromEntries(map.topics.map(t => [t.id, t]));
  assert.equal(byId.linux.state, 'strong');
  assert.equal(byId.linux.pct, 100);
  assert.equal(byId.k8s.state, 'weak');
  assert.equal(byId.k8s.pct, 33);
  assert.equal(byId.windows.state, 'unseen');
  assert.deepEqual(map.counts, { strong: 1, ok: 0, weak: 1, unseen: 1 });
});

test('knowledge map: 2 of 3 known is ok, and only in-level cards count', () => {
  const progress = { 'linux-0': { box: 2, due: NOW }, 'linux-1': { box: 2, due: NOW } };
  const map = knowledgeMap(TOPICS, { role: 'infra', level: 'senior' }, progress);
  assert.equal(map.topics.find(t => t.id === 'linux').state, 'ok');
  assert.equal(map.topics.find(t => t.id === 'linux').pct, 67);
  // Junior sees only tiers 1-2, so the same progress is 2/2 = strong.
  const junior = knowledgeMap(TOPICS, { role: 'infra', level: 'junior' }, progress);
  assert.equal(junior.topics.find(t => t.id === 'linux').state, 'strong');
});
