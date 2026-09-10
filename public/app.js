const selection = { trigger: null, follower: null };
let lastEventAt = null;
let triggerUris = new Set();

const $ = (id) => document.getElementById(id);

function trackNode(track) {
  const wrap = document.createElement('div');
  wrap.className = 'track';

  if (track.art) {
    const img = document.createElement('img');
    img.src = track.art;
    img.alt = '';
    wrap.append(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'art-fallback';
    wrap.append(fallback);
  }

  const text = document.createElement('div');
  text.className = 'track-text';

  const name = document.createElement('div');
  name.className = 'track-name';
  name.textContent = track.name;

  const artist = document.createElement('div');
  artist.className = 'track-artist';
  artist.textContent = track.artist;

  text.append(name, artist);
  wrap.append(text);
  return wrap;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---- pair builder ----

function setupSlot(slotName) {
  const slot = document.querySelector(`.slot[data-slot="${slotName}"]`);
  const input = slot.querySelector('[data-role="input"]');
  const results = slot.querySelector('[data-role="results"]');
  const chosen = slot.querySelector('[data-role="chosen"]');
  let debounce;

  function clearChoice() {
    selection[slotName] = null;
    chosen.hidden = true;
    chosen.replaceChildren();
    input.hidden = false;
    refreshCreateButton();
  }

  function choose(track) {
    selection[slotName] = track;
    results.hidden = true;
    input.value = '';
    input.hidden = true;

    const clear = document.createElement('button');
    clear.className = 'link';
    clear.textContent = 'Change';
    clear.onclick = clearChoice;

    chosen.replaceChildren(trackNode(track), clear);
    chosen.hidden = false;
    refreshCreateButton();
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const query = input.value.trim();
    if (!query) {
      results.hidden = true;
      return;
    }
    debounce = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const body = await response.json();
      if (!response.ok) {
        showBuilderError(body.error);
        return;
      }
      results.replaceChildren(...body.tracks.map((track) => {
        const button = document.createElement('button');
        button.append(trackNode(track));
        button.onclick = () => choose(track);
        return button;
      }));
      results.hidden = body.tracks.length === 0;
    }, 250);
  });

  document.addEventListener('click', (event) => {
    if (!slot.contains(event.target)) results.hidden = true;
  });
}

function refreshCreateButton() {
  $('create').disabled = !(selection.trigger && selection.follower);
}

function showBuilderError(message) {
  const el = $('builder-error');
  el.textContent = message || '';
  el.hidden = !message;
}

$('create').onclick = async () => {
  showBuilderError('');
  const response = await fetch('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  });
  const body = await response.json();
  if (!response.ok) {
    showBuilderError(body.error);
    return;
  }
  document.querySelectorAll('.slot [data-role="chosen"] .link').forEach((btn) => btn.click());
  toast('Pair saved');
  loadRules();
};

// ---- rules ----

async function loadRules() {
  const response = await fetch('/api/rules');
  const { rules, cycles } = await response.json();
  triggerUris = new Set(rules.filter((rule) => rule.enabled).map((rule) => rule.trigger.uri));

  $('rule-count').textContent = rules.length ? `(${rules.length})` : '';
  const container = $('rules');

  if (!rules.length) {
    container.innerHTML = '<p class="muted">No pairs yet. Add one above.</p>';
    return;
  }

  container.replaceChildren(...rules.map((rule) => {
    const row = document.createElement('div');
    row.className = `rule${rule.enabled ? '' : ' disabled'}`;

    const arrow = document.createElement('span');
    arrow.className = 'muted';
    arrow.textContent = '→';

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';
    right.append(trackNode(rule.follower));
    if (cycles.includes(rule.id)) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.title = 'This pair is part of a loop. Duet runs it once per chain, then stops.';
      badge.textContent = 'loop';
      right.append(badge);
    }

    const toggle = document.createElement('button');
    toggle.className = 'link';
    toggle.textContent = rule.enabled ? 'Disable' : 'Enable';
    toggle.onclick = async () => {
      await fetch(`/api/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      loadRules();
    };

    const remove = document.createElement('button');
    remove.className = 'link danger';
    remove.textContent = 'Delete';
    remove.onclick = async () => {
      await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' });
      loadRules();
    };

    row.append(trackNode(rule.trigger), arrow, right, toggle, remove);
    return row;
  }));
}

// ---- status polling ----

function renderAccount(status) {
  const el = $('account');

  if (!status.configured) {
    el.innerHTML = '<span class="pill">Add SPOTIFY_CLIENT_ID to .env</span>';
    return;
  }
  if (!status.authed) {
    el.innerHTML = '<a class="connect" href="/api/login">Connect Spotify</a>';
    return;
  }

  const name = status.profile?.name || 'Spotify';
  const free = status.profile && status.profile.product !== 'premium';
  el.innerHTML = '';

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.innerHTML = '<span class="dot on"></span>';
  pill.append(free ? `${name} - Premium required` : name);

  const out = document.createElement('button');
  out.className = 'link';
  out.textContent = 'Disconnect';
  out.onclick = async () => {
    await fetch('/api/logout', { method: 'POST' });
    refreshStatus();
  };

  el.append(pill, out);
}

function renderNowPlaying(nowPlaying) {
  const card = $('now');
  const body = $('now-body');

  if (!nowPlaying) {
    body.className = 'now-body muted';
    body.textContent = 'Nothing playing';
    card.classList.remove('is-trigger');
    return;
  }

  body.className = 'now-body';
  body.replaceChildren(trackNode(nowPlaying));

  const isTrigger = triggerUris.has(nowPlaying.uri);
  card.classList.toggle('is-trigger', isTrigger);

  const note = document.createElement('span');
  note.className = 'muted';
  const state = nowPlaying.isPlaying ? '' : 'paused - ';
  note.textContent = isTrigger ? `${state}paired, partner queued` : `${state}no pair`;
  body.append(note);
}

function renderEvents(events) {
  $('events').replaceChildren(...events.slice(0, 12).map((event) => {
    const row = document.createElement('div');
    row.className = `event ${event.level}`;

    const time = document.createElement('time');
    time.textContent = new Date(event.at).toLocaleTimeString();

    const text = document.createElement('span');
    text.textContent = event.message;

    row.append(time, text);
    return row;
  }));

  const newest = events[0];
  if (newest && newest.level === 'fired' && newest.at !== lastEventAt) {
    if (lastEventAt !== null) toast(newest.message);
    lastEventAt = newest.at;
  } else if (newest && lastEventAt === null) {
    lastEventAt = newest.at;
  }
}

async function refreshStatus() {
  try {
    const status = await (await fetch('/api/status')).json();
    renderAccount(status);
    renderNowPlaying(status.nowPlaying);
    renderEvents(status.events || []);
  } catch {
    // Server restarting; the next poll picks it up.
  }
}

setupSlot('trigger');
setupSlot('follower');
loadRules();
refreshStatus();
setInterval(refreshStatus, 2000);
