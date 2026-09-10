# Duet

Pair your songs. When one plays on Spotify, its partner is queued next.

Some songs belong back to back, and some should never touch. Duet is a small local app: a web UI
where you pair songs by hand, plus a watcher that polls your Spotify playback and adds the partner
to your queue the moment a paired song starts.

Everything runs on your machine. Nothing is sent anywhere except to Spotify's own API.

## Requirements

- **Spotify Premium.** Spotify's playback and queue endpoints are Premium-only. There is no way
  around this.
- Node 18 or newer.

## Setup

1. **Create a Spotify app.** Go to
   [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
   - Redirect URI: `http://127.0.0.1:8787/callback` — exactly this. Spotify rejects `localhost`,
     it has to be the loopback IP.
   - Which API: **Web API**.
   - Copy the **Client ID**. There is no client secret to copy; Duet uses PKCE.

2. **Configure and run.**

   ```sh
   cp .env.example .env       # then paste your Client ID into it
   npm install
   npm start
   ```

3. Open <http://127.0.0.1:8787>, click **Connect Spotify**, approve the permissions.

## Using it

Search a song in **When this plays**, search another in **Queue this next**, hit **Pair**. That's
it — the watcher is already running in the same process.

Play a paired song in Spotify and within a few seconds its partner lands in your queue. The
Activity panel shows every pair that fires.

### How it behaves

- **Chaining works.** If A→B and B→C are both paired, playing A queues B, and when B starts, C is
  queued.
- **Loops stop themselves.** A→B→A queues B, then stops rather than ping-ponging forever. Pairs on
  a loop are marked with a `loop` badge in the UI.
- **Once per play.** A pair fires when its trigger song *starts*, not on every poll. Restarting the
  same song from the beginning counts as a new play and fires again.
- **Queue position.** Spotify's API has no way to reorder or remove queue items — it only supports
  adding. The partner is added as soon as the trigger starts, which puts it ahead of the playlist's
  next track. If you had already manually queued songs, those still play first.
- **One partner per song.** Each song can be the trigger for exactly one pair.

## Where your data lives

`~/.duet/`

| File | What |
| --- | --- |
| `tokens.json` | Spotify access + refresh tokens, mode `0600` |
| `rules.json` | Your pairs |
| `duet.log` | One line per event |

Nothing sensitive is stored in the repo. `.env` is gitignored.

## Running it at login (optional)

Once you're happy with it, install the launchd agent so it starts with your Mac:

```sh
sed -e "s|__NODE__|$(which node)|" \
    -e "s|__PROJECT__|$PWD|" \
    -e "s|__HOME__|$HOME|" \
    launchd/com.duet.watcher.plist.template > ~/Library/LaunchAgents/com.duet.watcher.plist

launchctl load ~/Library/LaunchAgents/com.duet.watcher.plist
```

To stop it:

```sh
launchctl unload ~/Library/LaunchAgents/com.duet.watcher.plist
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `INVALID_CLIENT: Invalid redirect URI` | The redirect URI on the Spotify dashboard doesn't match `http://127.0.0.1:8787/callback` character for character. |
| Activity says Spotify refused the request | The account isn't Premium. |
| "No active Spotify device" | Nothing is playing anywhere. Start a song; Duet picks it up on the next poll. |
| Header shows "Add SPOTIFY_CLIENT_ID to .env" | `.env` is missing or the Client ID line is empty. |
