import fs from 'node:fs';
import { LOG_FILE } from './config.js';

const RING_SIZE = 50;
const events = [];

/**
 * Record an event to the log file and to the in-memory ring buffer the UI reads.
 * `level` is one of: info, fired, skip, warn, error.
 */
export function log(level, message, detail = null) {
  const event = { at: new Date().toISOString(), level, message, detail };

  events.push(event);
  if (events.length > RING_SIZE) events.shift();

  const line = `${event.at} [${level}] ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // A failed log write should never take the watcher down.
  }
}

export function recentEvents() {
  return events.slice().reverse();
}
