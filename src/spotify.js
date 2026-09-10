import { getAccessToken } from './auth.js';

const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(status, body) {
    const reason = body?.error?.message || body?.error || 'request failed';
    super(`Spotify ${status}: ${reason}`);
    this.status = status;
    this.reason = body?.error?.reason || null;
  }
}

async function parse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Call the Spotify API with the shared token, retrying once on an expired token
 * and once on a rate limit. Non-2xx responses throw a SpotifyError.
 */
async function request(path, { method = 'GET', retryOn401 = true, retryOn429 = true } = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 && retryOn401) {
    await getAccessToken({ force: true });
    return request(path, { method, retryOn401: false, retryOn429 });
  }

  if (response.status === 429 && retryOn429) {
    const waitSeconds = Math.min(Number(response.headers.get('retry-after') || 1), 10);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return request(path, { method, retryOn401, retryOn429: false });
  }

  const body = await parse(response);
  if (!response.ok) throw new SpotifyError(response.status, body);
  return body;
}

export function getMe() {
  return request('/me');
}

/** Current playback state, or null when nothing is active (Spotify answers 204). */
export function getPlayback() {
  return request('/me/player');
}

export function addToQueue(uri) {
  return request(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
}

export async function searchTracks(query, limit = 8) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
  const body = await request(`/search?${params}`);
  return (body?.tracks?.items || []).map(toTrack);
}

/** Trim a Spotify track object down to the shape rules and the UI store. */
export function toTrack(track) {
  return {
    uri: track.uri,
    id: track.id,
    name: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    album: track.album?.name || '',
    art: track.album?.images?.at(-1)?.url || null,
  };
}
