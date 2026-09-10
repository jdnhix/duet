/**
 * Poll intervals for when there is nothing playing at all — Spotify closed, no
 * active device. Without this the watcher would keep asking every 10s overnight.
 *
 * Only the "no playback state" case backs off. A paused track keeps the short
 * interval, since playback is likely to resume any moment.
 */
export const IDLE_TIERS = [
  { afterMs: 0, delayMs: 10_000 },
  { afterMs: 60_000, delayMs: 30_000 },
  { afterMs: 5 * 60_000, delayMs: 60_000 },
];

/** Delay before the next poll, given how long there has been nothing to see. */
export function idleDelayMs(idleForMs) {
  let delay = IDLE_TIERS[0].delayMs;
  for (const tier of IDLE_TIERS) {
    if (idleForMs >= tier.afterMs) delay = tier.delayMs;
  }
  return delay;
}
