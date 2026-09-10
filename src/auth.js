import crypto from 'node:crypto';
import fs from 'node:fs';
import { CLIENT_ID, REDIRECT_URI, SCOPES, TOKENS_FILE } from './config.js';
import { log } from './log.js';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REFRESH_MARGIN_MS = 60_000;

let tokens = readTokens();
let refreshInFlight = null;

// state -> { verifier, createdAt }; entries are single-use and expire in 10 minutes.
const pendingLogins = new Map();

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeTokens(next) {
  tokens = next;
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

function storeTokenResponse(payload, previousRefreshToken) {
  writeTokens({
    access_token: payload.access_token,
    // PKCE rotates refresh tokens, but a refresh response may omit one; keep the old one then.
    refresh_token: payload.refresh_token || previousRefreshToken,
    expires_at: Date.now() + payload.expires_in * 1000,
    scope: payload.scope,
  });
}

export function isAuthed() {
  return Boolean(tokens?.refresh_token);
}

export function logout() {
  tokens = null;
  try {
    fs.rmSync(TOKENS_FILE, { force: true });
  } catch {
    // Nothing to clear.
  }
}

/** Build the Spotify consent URL and remember the PKCE verifier for the callback. */
export function createAuthUrl() {
  if (!CLIENT_ID) throw new Error('SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env first.');

  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  pendingLogins.set(state, { verifier, createdAt: Date.now() });
  for (const [key, value] of pendingLogins) {
    if (Date.now() - value.createdAt > 600_000) pendingLogins.delete(key);
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCode(code, state) {
  const pending = pendingLogins.get(state);
  if (!pending) throw new Error('Unknown or expired login state. Start the connect flow again.');
  pendingLogins.delete(state);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: pending.verifier,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${payload.error_description || payload.error}`);
  }

  storeTokenResponse(payload, null);
  log('info', 'Connected to Spotify');
}

async function refresh() {
  const previous = tokens.refresh_token;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: previous,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    if (payload.error === 'invalid_grant') {
      logout();
      log('error', 'Spotify refresh token was rejected. Reconnect from the Duet UI.');
    }
    throw new Error(`Token refresh failed: ${payload.error_description || payload.error}`);
  }

  storeTokenResponse(payload, previous);
  return tokens.access_token;
}

/** Single accessor for a valid access token; refreshes at most once concurrently. */
export async function getAccessToken({ force = false } = {}) {
  if (!tokens?.refresh_token) throw new Error('Not connected to Spotify.');

  const stillValid = tokens.access_token && Date.now() < tokens.expires_at - REFRESH_MARGIN_MS;
  if (stillValid && !force) return tokens.access_token;

  if (!refreshInFlight) {
    refreshInFlight = refresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
