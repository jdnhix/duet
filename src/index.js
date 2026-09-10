import { CLIENT_ID, HOST, PORT } from './config.js';
import { log } from './log.js';
import { listen } from './server.js';
import { start, stop } from './watcher.js';

await listen();

if (!CLIENT_ID) {
  log('warn', 'SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env and add your Client ID.');
}

start();

console.log(`\n  Duet is running. Open http://${HOST}:${PORT}\n`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop();
    log('info', 'Duet stopped');
    process.exit(0);
  });
}
