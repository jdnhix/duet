import { isAuthed } from './auth.js';
import { createChainTracker } from './chain.js';
import { POLL_ACTIVE_MS, POLL_IDLE_MS, REPLAY_THRESHOLD_MS } from './config.js';
import { log } from './log.js';
import { findEnabledRuleFor } from './rules.js';
import { addToQueue, getPlayback, SpotifyError, toTrack } from './spotify.js';

let timer = null;
let stopped = true;

let lastSeen = null;    // { uri, progressMs } from the previous poll
let nowPlaying = null;  // what the UI shows

const tracker = createChainTracker();

const throttledLogs = new Map();

function logThrottled(key, level, message, detail, everyMs = 300_000) {
  const last = throttledLogs.get(key) || 0;
  if (Date.now() - last < everyMs) return;
  throttledLogs.set(key, Date.now());
  log(level, message, detail);
}

async function onTrackStarted(track) {
  const rule = findEnabledRuleFor(track.uri);
  const action = tracker.decide(track.uri, rule);

  if (action === 'none') return;
  if (action === 'loop') {
    log('skip', `Loop blocked: ${rule.follower.name} is already in this chain`, {
      trigger: track.name,
    });
    return;
  }

  try {
    await addToQueue(rule.follower.uri);
    tracker.confirmQueued(rule.follower.uri);
    log('fired', `Queued ${rule.follower.name} after ${track.name}`, {
      trigger: track.name,
      follower: `${rule.follower.name} - ${rule.follower.artist}`,
    });
  } catch (error) {
    handleSpotifyError(error, `queueing ${rule.follower.name}`);
  }
}

function handleSpotifyError(error, context) {
  if (!(error instanceof SpotifyError)) {
    logThrottled('generic', 'error', `Failed ${context}: ${error.message}`);
    return;
  }

  if (error.status === 404 || error.reason === 'NO_ACTIVE_DEVICE') {
    logThrottled('no-device', 'warn', 'No active Spotify device; waiting.');
    return;
  }
  if (error.status === 403) {
    logThrottled('forbidden', 'error',
      `Spotify refused the request (${context}). This usually means the account is not Premium.`);
    return;
  }
  logThrottled(`status-${error.status}`, 'error', `Failed ${context}: ${error.message}`);
}

async function tick() {
  if (!isAuthed()) {
    nowPlaying = null;
    return POLL_IDLE_MS;
  }

  let state;
  try {
    state = await getPlayback();
  } catch (error) {
    handleSpotifyError(error, 'reading playback');
    return POLL_IDLE_MS;
  }

  if (!state?.item || state.item.type !== 'track') {
    nowPlaying = null;
    lastSeen = null;
    return POLL_IDLE_MS;
  }

  const track = toTrack(state.item);
  nowPlaying = {
    ...track,
    isPlaying: Boolean(state.is_playing),
    progressMs: state.progress_ms ?? 0,
    durationMs: state.item.duration_ms ?? 0,
    device: state.device?.name || null,
  };

  const restarted = lastSeen?.uri === track.uri &&
    nowPlaying.progressMs < lastSeen.progressMs - REPLAY_THRESHOLD_MS;
  const isNewPlay = !lastSeen || lastSeen.uri !== track.uri || restarted;

  lastSeen = { uri: track.uri, progressMs: nowPlaying.progressMs };
  if (isNewPlay) await onTrackStarted(track);

  return nowPlaying.isPlaying ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

async function loop() {
  if (stopped) return;

  let delay = POLL_IDLE_MS;
  try {
    delay = await tick();
  } catch (error) {
    log('error', `Watcher tick failed: ${error.message}`);
  }

  if (!stopped) timer = setTimeout(loop, delay);
}

export function start() {
  if (!stopped) return;
  stopped = false;
  log('info', 'Watcher started');
  loop();
}

export function stop() {
  stopped = true;
  clearTimeout(timer);
}

/** Called when rules change so a stale chain does not suppress a new pair. */
export function resetChain() {
  tracker.reset();
}

export function getNowPlaying() {
  return nowPlaying;
}
