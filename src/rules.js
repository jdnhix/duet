import crypto from 'node:crypto';
import fs from 'node:fs';
import { RULES_FILE } from './config.js';

const EMPTY = { version: 1, rules: [] };

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
    if (!Array.isArray(parsed.rules)) return { ...EMPTY };
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

function write(store) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(store, null, 2));
}

export function listRules() {
  return read().rules;
}

function assertTrack(track, label) {
  if (!track?.uri?.startsWith('spotify:track:')) {
    throw new Error(`${label} must be a Spotify track.`);
  }
}

export function addRule({ trigger, follower }) {
  assertTrack(trigger, 'Trigger');
  assertTrack(follower, 'Follower');
  if (trigger.uri === follower.uri) {
    throw new Error('A song cannot trigger itself.');
  }

  const store = read();
  if (store.rules.some((rule) => rule.trigger.uri === trigger.uri)) {
    throw new Error('That song already has a partner. Delete the existing pair first.');
  }

  const rule = {
    id: crypto.randomUUID(),
    enabled: true,
    trigger,
    follower,
    createdAt: new Date().toISOString(),
  };
  store.rules.push(rule);
  write(store);
  return rule;
}

export function updateRule(id, patch) {
  const store = read();
  const rule = store.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error('No such pair.');

  if (typeof patch.enabled === 'boolean') rule.enabled = patch.enabled;
  write(store);
  return rule;
}

export function deleteRule(id) {
  const store = read();
  const next = store.rules.filter((rule) => rule.id !== id);
  if (next.length === store.rules.length) throw new Error('No such pair.');
  write({ ...store, rules: next });
}

export function findEnabledRuleFor(trackUri) {
  return listRules().find((rule) => rule.enabled && rule.trigger.uri === trackUri) || null;
}

/**
 * Ids of rules that sit on a cycle (A->B->A). These still run; the watcher's chain
 * guard stops them after one pass. The UI just flags them.
 */
export function rulesOnCycles() {
  const rules = listRules();
  const byTrigger = new Map(rules.map((rule) => [rule.trigger.uri, rule]));
  const flagged = new Set();

  for (const start of rules) {
    const seen = new Set([start.trigger.uri]);
    const path = [start];
    let current = byTrigger.get(start.follower.uri);

    while (current) {
      path.push(current);
      if (seen.has(current.trigger.uri)) break;
      seen.add(current.trigger.uri);
      if (seen.has(current.follower.uri)) {
        for (const rule of path) flagged.add(rule.id);
        break;
      }
      current = byTrigger.get(current.follower.uri);
    }
  }
  return [...flagged];
}
