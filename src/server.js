import express from 'express';
import { createAuthUrl, exchangeCode, isAuthed, logout } from './auth.js';
import { CLIENT_ID, HOST, PORT, PUBLIC_DIR } from './config.js';
import { log, recentEvents } from './log.js';
import { addRule, deleteRule, listRules, rulesOnCycles, updateRule } from './rules.js';
import { getMe, searchTracks } from './spotify.js';
import { getNowPlaying, resetChain } from './watcher.js';

let cachedProfile = null;

function wrap(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      const status = error.status === 401 ? 401 : 400;
      res.status(status).json({ error: error.message });
    });
  };
}

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/status', wrap(async (req, res) => {
    const authed = isAuthed();
    if (authed && !cachedProfile) {
      try {
        const me = await getMe();
        cachedProfile = { name: me.display_name || me.id, product: me.product };
      } catch {
        cachedProfile = null;
      }
    }
    if (!authed) cachedProfile = null;

    res.json({
      configured: Boolean(CLIENT_ID),
      authed,
      profile: cachedProfile,
      nowPlaying: getNowPlaying(),
      events: recentEvents(),
    });
  }));

  app.get('/api/login', (req, res) => {
    try {
      res.redirect(createAuthUrl());
    } catch (error) {
      res.status(400).send(error.message);
    }
  });

  app.post('/api/logout', (req, res) => {
    logout();
    cachedProfile = null;
    res.json({ ok: true });
  });

  app.get('/callback', wrap(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      res.status(400).send(`Spotify denied the request: ${error}`);
      return;
    }
    await exchangeCode(String(code), String(state));
    cachedProfile = null;
    res.redirect('/');
  }));

  app.get('/api/search', wrap(async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
      res.json({ tracks: [] });
      return;
    }
    res.json({ tracks: await searchTracks(query) });
  }));

  app.get('/api/rules', (req, res) => {
    res.json({ rules: listRules(), cycles: rulesOnCycles() });
  });

  app.post('/api/rules', wrap(async (req, res) => {
    const rule = addRule(req.body || {});
    resetChain();
    log('info', `Paired ${rule.trigger.name} -> ${rule.follower.name}`);
    res.json({ rule });
  }));

  app.patch('/api/rules/:id', wrap(async (req, res) => {
    const rule = updateRule(req.params.id, req.body || {});
    resetChain();
    res.json({ rule });
  }));

  app.delete('/api/rules/:id', wrap(async (req, res) => {
    deleteRule(req.params.id);
    resetChain();
    res.json({ ok: true });
  }));

  return app;
}

export function listen() {
  return new Promise((resolve) => {
    createServer().listen(PORT, HOST, () => {
      log('info', `Duet UI on http://${HOST}:${PORT}`);
      resolve();
    });
  });
}
