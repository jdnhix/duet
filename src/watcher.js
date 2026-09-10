import { isAuthed } from './auth.js';
import { idleDelayMs } from './backoff.js';
import { createChainTracker } from './chain.js';
import { POLL_ACTIVE_MS, POLL_IDLE_MS, REPLAY_THRESHOLD_MS } from './config.js';
import { log } from './log.js';
import { findEnabledRuleFor } from './rules.js';
import { addToQueue, getPlayback, SpotifyError, toTrack } from './spotify.js';

let timer = null;
let ticking = false;
let stopped = true;

let lastSeen = null;    // { uri, progressMs } from the previous poll
let nowPlaying = null;  // what the UI shows
let idleSince = null;   // when playback last went quiet, for poll backoff

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

/** Mark playback as quiet and return how long to wait before looking again. */
function idle() {
  nowPlaying = null;
  if (idleSince === null) idleSince = Date.now();
  return idleDelayMs(Date.now() - idleSince);
}

async function tick() {
  if (!isAuthed()) return idle();

  let state;
  try {
    state = await getPlayback();
  } catch (error) {
    handleSpotifyError(error, 'reading playback');
    return idle();
  }

  if (!state?.item || state.item.type !== 'track') {
    lastSeen = null;
    return idle();
  }

  idleSince = null;
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

  // A paused track keeps the short interval; only a dead player backs off.
  return nowPlaying.isPlaying ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

async function loop() {
  if (stopped) return;
  timer = null;
  ticking = true;

  let delay = POLL_IDLE_MS;
  try {
    delay = await tick();
  } catch (error) {
    log('error', `Watcher tick failed: ${error.message}`);
  }

  ticking = false;
  // A wake() during the tick may already have queued the next run.
  if (!stopped && timer === null) timer = setTimeout(loop, delay);
}

/** Poll now instead of waiting out a long backoff. */
function wake() {
  if (stopped || ticking) return;
  clearTimeout(timer);
  timer = setTimeout(loop, 0);
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
  // Drop the backoff and look again now, so an edit takes effect immediately.
  idleSince = null;
  wake();
}

export function getNowPlaying() {
  return nowPlaying;
}
