import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env reader so the project stays at one dependency. Node 20.5 predates --env-file.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

export const DATA_DIR = process.env.DUET_DATA_DIR || path.join(os.homedir(), '.duet');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
export const RULES_FILE = path.join(DATA_DIR, 'rules.json');
export const LOG_FILE = path.join(DATA_DIR, 'duet.log');
export const PUBLIC_DIR = path.join(ROOT, 'public');

export const PORT = Number(process.env.PORT || 8787);
export const HOST = '127.0.0.1';

// Spotify rejects `localhost`; the redirect URI has to be the loopback IP literal.
export const REDIRECT_URI = `http://${HOST}:${PORT}/callback`;
export const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

export const POLL_ACTIVE_MS = 3000;
export const POLL_IDLE_MS = 10000;

// A backwards jump larger than this counts as a replay rather than a seek.
export const REPLAY_THRESHOLD_MS = 5000;
