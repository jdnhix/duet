import assert from 'node:assert/strict';
import test from 'node:test';
import { createChainTracker } from '../src/chain.js';

const pair = (trigger, follower) => ({
  trigger: { uri: trigger, name: trigger },
  follower: { uri: follower, name: follower },
});

test('queues the follower for a song the listener started', () => {
  const tracker = createChainTracker();
  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
});

test('does nothing for a song with no pair', () => {
  const tracker = createChainTracker();
  assert.equal(tracker.decide('A', null), 'none');
});

test('chains A -> B -> C', () => {
  const tracker = createChainTracker();

  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
  tracker.confirmQueued('B');

  assert.equal(tracker.decide('B', pair('B', 'C')), 'queue');
  tracker.confirmQueued('C');

  assert.deepEqual(tracker.snapshot().chain, ['A', 'B', 'C']);
});

test('blocks the loop in A -> B -> A', () => {
  const tracker = createChainTracker();

  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
  tracker.confirmQueued('B');

  assert.equal(tracker.decide('B', pair('B', 'A')), 'loop');
});

test('blocks a longer loop A -> B -> C -> A', () => {
  const tracker = createChainTracker();

  tracker.decide('A', pair('A', 'B'));
  tracker.confirmQueued('B');
  tracker.decide('B', pair('B', 'C'));
  tracker.confirmQueued('C');

  assert.equal(tracker.decide('C', pair('C', 'A')), 'loop');
});

test('a listener-started song begins a fresh chain, so an old loop can run again', () => {
  const tracker = createChainTracker();

  tracker.decide('A', pair('A', 'B'));
  tracker.confirmQueued('B');
  assert.equal(tracker.decide('B', pair('B', 'A')), 'loop');

  // The listener now plays B themselves; that starts a new chain.
  assert.equal(tracker.decide('B', pair('B', 'A')), 'queue');
});

test('a failed queue does not extend the chain', () => {
  const tracker = createChainTracker();

  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
  // confirmQueued is intentionally not called, mimicking a Spotify error.

  // The listener plays B anyway; it is not treated as one of ours.
  assert.equal(tracker.decide('B', pair('B', 'A')), 'queue');
});

test('replaying the trigger fires the pair again', () => {
  const tracker = createChainTracker();

  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
  tracker.confirmQueued('B');
  assert.equal(tracker.decide('A', pair('A', 'B')), 'queue');
});

test('reset clears the chain', () => {
  const tracker = createChainTracker();

  tracker.decide('A', pair('A', 'B'));
  tracker.confirmQueued('B');
  tracker.reset();

  assert.deepEqual(tracker.snapshot(), { chain: [], queuedByUs: [] });
});
