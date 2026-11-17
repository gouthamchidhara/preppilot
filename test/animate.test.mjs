import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringOffset, nextStage, prevStage, stageLabel, sceneName, storyPieces } from '../web/js/animate.js';

test('ringOffset maps a percentage to a dash offset', () => {
  assert.equal(ringOffset(0), 100);
  assert.equal(ringOffset(100), 0);
  assert.equal(ringOffset(75), 25);
  assert.equal(ringOffset(150), 0);
  assert.equal(ringOffset(-10), 100);
  assert.equal(ringOffset(NaN), 100);
});

test('the diagram player moves one stage at a time', () => {
  assert.equal(nextStage(null, 4), 0);
  assert.equal(nextStage(0, 4), 1);
  assert.equal(nextStage(3, 4), 3);
  assert.equal(prevStage(null), null);
  assert.equal(prevStage(0), null);
  assert.equal(prevStage(2), 1);
});

test('stageLabel names the view', () => {
  assert.equal(stageLabel(null, 4), 'Full diagram');
  assert.equal(stageLabel(undefined, 4), 'Full diagram');
  assert.equal(stageLabel(0, 4), 'Step 1 of 4');
  assert.equal(stageLabel(3, 4), 'Step 4 of 4');
});

test('storyPieces builds the diagram piece by piece across the lesson', () => {
  // A 7-piece diagram over 9 cards: card 1 shows the first piece, the last
  // card shows the whole picture, and the count never goes backwards.
  const counts = Array.from({ length: 9 }, (_, ci) => storyPieces(ci, 9, 7).built);
  assert.equal(counts[0], 1);
  assert.equal(counts[8], 7);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1]);
  // The fresh piece is the one this card unlocked, so it can pop in.
  assert.equal(storyPieces(0, 9, 7).fresh, 0);
  assert.equal(storyPieces(8, 9, 7).fresh, 6);
});

test('storyPieces: a one-card lesson shows the whole diagram at once', () => {
  assert.deepEqual(storyPieces(0, 1, 4), { built: 4, fresh: 'all' });
});

test('sceneName names the arc: hook, build-up, payoff', () => {
  assert.equal(sceneName(0, 9), 'The hook');
  assert.equal(sceneName(4, 9), 'The build-up');
  assert.equal(sceneName(8, 9), 'The payoff');
  assert.equal(sceneName(0, 1), 'The whole story');
  assert.equal(sceneName(0, 2), 'The hook');
  assert.equal(sceneName(1, 2), 'The payoff');
});
