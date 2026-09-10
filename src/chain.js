/**
 * Tracks the current automatic chain so A->B->C works while A->B->A stops after one pass.
 *
 * A chain is the run of songs Duet queued back to back. A song the listener started
 * themselves begins a new chain; a song Duet queued extends the one in progress.
 */
export function createChainTracker() {
  let chain = new Set();
  let queuedByUs = new Set();

  return {
    /**
     * Record that `trackUri` just started and decide what to do about `rule`
     * (the enabled pair triggered by that song, or null).
     *
     * Returns 'queue', 'loop' (would revisit a song already in this chain), or 'none'.
     * Call exactly once per new play.
     */
    decide(trackUri, rule) {
      if (queuedByUs.has(trackUri)) {
        queuedByUs.delete(trackUri);
      } else {
        chain = new Set([trackUri]);
      }

      if (!rule) return 'none';
      if (chain.has(rule.follower.uri)) return 'loop';
      return 'queue';
    },

    /** Call after the follower was actually accepted by Spotify. */
    confirmQueued(uri) {
      chain.add(uri);
      queuedByUs.add(uri);
    },

    reset() {
      chain = new Set();
      queuedByUs = new Set();
    },

    /** Exposed for tests and debugging. */
    snapshot() {
      return { chain: [...chain], queuedByUs: [...queuedByUs] };
    },
  };
}
