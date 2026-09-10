import fs from 'node:fs';
import { LOG_FILE } from './config.js';

const RING_SIZE = 200;
// Cap how much of the log file we read back at startup, so a long history stays cheap.
const HISTORY_BYTES = 256 * 1024;
const LINE = /^(\S+) \[(\w+)\] (.*?)( \{.*\})?$/;

const events = loadHistory();

/** Read the tail of the log file so the activity feed survives a restart. */
function loadHistory() {
  let text;
  try {
    const { size } = fs.statSync(LOG_FILE);
    const length = Math.min(size, HISTORY_BYTES);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(LOG_FILE, 'r');
    try {
      fs.readSync(fd, buffer, 0, length, size - length);
    } finally {
      fs.closeSync(fd);
    }
    text = buffer.toString('utf8');
    // Drop a leading partial line when we started mid-file.
    if (length < size) text = text.slice(text.indexOf('\n') + 1);
  } catch {
    return [];
  }

  const parsed = [];
  for (const line of text.split('\n')) {
    const match = LINE.exec(line);
    if (!match) continue;

    const [, at, level, message, detail] = match;
    if (Number.isNaN(Date.parse(at))) continue;

    let parsedDetail = null;
    if (detail) {
      try {
        parsedDetail = JSON.parse(detail);
      } catch {
        // Leave it off rather than dropping the whole event.
      }
    }
    parsed.push({ at, level, message, detail: parsedDetail });
  }
  return parsed.slice(-RING_SIZE);
}

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
