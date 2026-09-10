import assert from 'node:assert/strict';
import test from 'node:test';
import { idleDelayMs } from '../src/backoff.js';

test('polls every 10s when playback has just stopped', () => {
  assert.equal(idleDelayMs(0), 10_000);
  assert.equal(idleDelayMs(30_000), 10_000);
});

test('eases to 30s after a minute of quiet', () => {
  assert.equal(idleDelayMs(60_000), 30_000);
  assert.equal(idleDelayMs(4 * 60_000), 30_000);
});

test('settles at 60s after five minutes of quiet', () => {
  assert.equal(idleDelayMs(5 * 60_000), 60_000);
  assert.equal(idleDelayMs(8 * 60 * 60_000), 60_000);
});

test('never returns a delay outside the configured range', () => {
  for (const idleFor of [-1, 0, 1, 59_999, 300_001, 1e9]) {
    const delay = idleDelayMs(idleFor);
    assert.ok(delay >= 10_000 && delay <= 60_000, `${idleFor} -> ${delay}`);
  }
});

test('an overnight idle costs far fewer requests than a flat 10s poll', () => {
  const eightHours = 8 * 60 * 60_000;
  let elapsed = 0;
  let requests = 0;
  while (elapsed < eightHours) {
    elapsed += idleDelayMs(elapsed);
    requests += 1;
  }
  assert.ok(requests < 600, `expected under 600 requests, got ${requests}`);
  assert.equal(Math.round((1 - requests / (eightHours / 10_000)) * 100), 83);
});
