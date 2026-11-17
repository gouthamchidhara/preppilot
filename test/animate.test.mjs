import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringOffset, nextStage, prevStage, stageLabel } from '../web/js/animate.js';

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
