import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// rules.js resolves its storage path at import time, so point it at a temp dir first.
process.env.DUET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'duet-test-'));
const { addRule, deleteRule, listRules, rulesOnCycles, updateRule } = await import('../src/rules.js');

const track = (id) => ({ uri: `spotify:track:${id}`, id, name: id, artist: 'Someone', art: null });

test('adds, toggles and deletes a pair', () => {
  const rule = addRule({ trigger: track('a'), follower: track('b') });
  assert.equal(listRules().length, 1);
  assert.equal(rule.enabled, true);

  updateRule(rule.id, { enabled: false });
  assert.equal(listRules()[0].enabled, false);

  deleteRule(rule.id);
  assert.equal(listRules().length, 0);
});

test('rejects self-pairs, duplicates and non-tracks', () => {
  assert.throws(() => addRule({ trigger: track('a'), follower: track('a') }), /cannot trigger itself/);
  assert.throws(() => addRule({ trigger: { uri: 'spotify:album:x' }, follower: track('b') }), /must be a Spotify track/);

  const rule = addRule({ trigger: track('a'), follower: track('b') });
  assert.throws(() => addRule({ trigger: track('a'), follower: track('c') }), /already has a partner/);
  deleteRule(rule.id);
});

test('flags pairs that sit on a cycle', () => {
  const ab = addRule({ trigger: track('a'), follower: track('b') });
  const bc = addRule({ trigger: track('b'), follower: track('c') });
  assert.deepEqual(rulesOnCycles(), []);

  const ca = addRule({ trigger: track('c'), follower: track('a') });
  assert.deepEqual(rulesOnCycles().sort(), [ab.id, bc.id, ca.id].sort());

  deleteRule(ca.id);
  assert.deepEqual(rulesOnCycles(), []);
});
