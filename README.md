# Duet

Some songs belong together - when a song plays on Spotify, queue its partner next.
## Setup

Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) with
redirect URI `http://127.0.0.1:8787/callback` (Spotify rejects `localhost`). Copy the Client ID —
there's no secret, Duet uses PKCE.

```sh
cp .env.example .env      # paste the Client ID into it
npm install
npm start
```

Open <http://127.0.0.1:8787>, connect Spotify, pair two songs.

macOS suspends the watcher when the machine sleeps. To keep it polling with the lid shut, run
`npm run start:awake` instead — it wraps the app in `caffeinate -is`, which stops the Mac sleeping
at all while it runs. Only holds on AC power, and the machine stays fully awake, so mind the heat
if it lives in a bag.

## Notes

- Spotify has no reorder or remove queue API, only add. The partner goes in ahead of the playlist's
  next track but behind anything you queued manually.
- A→B→C chains. A→B→A queues B once, then stops.
- A pair fires when its trigger starts. Replaying the trigger fires it again.
- One partner per song.
- Tokens, pairs and logs live in `~/.duet/`.

## Run at login

```sh
sed -e "s|__NODE__|$(which node)|" -e "s|__PROJECT__|$PWD|" -e "s|__HOME__|$HOME|" \
  launchd/com.duet.watcher.plist.template > ~/Library/LaunchAgents/com.duet.watcher.plist
launchctl load ~/Library/LaunchAgents/com.duet.watcher.plist
```

`launchctl unload` the same path to stop it.
