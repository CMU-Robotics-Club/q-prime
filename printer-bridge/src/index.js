// Printer bridge: reads live status from the club's printers on the local
// network and reports it to the q-prime backend (convex/printers.ts), which
// shows it on the home page. Admins manage the printer list in Settings; the
// bridge fetches it from the backend. See ../README.md.

import { watchBambu } from './bambu.js';
import { watchElegoo } from './elegoo.js';

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL ?? 'http://convex-backend:3211';
const HTTP_API_PREFIX = process.env.HTTP_API_PREFIX ?? '/api';
const SECRET = process.env.PRINTER_BRIDGE_SECRET;

// How often to check for printers added, changed or removed in Settings.
const CONFIG_POLL_MS = 30_000;
// Post right away when a printer's status changes, but at most this often.
const MIN_POST_INTERVAL_MS = 10_000;
// Post at least this often so the site can tell the bridge is still running.
const HEARTBEAT_MS = 60_000;

const WATCHERS = { bambu: watchBambu, elegoo: watchElegoo };

if (!SECRET) {
  console.error('PRINTER_BRIDGE_SECRET is not set');
  process.exit(1);
}

const api = (path) => `${CONVEX_SITE_URL}${HTTP_API_PREFIX}${path}`;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` };

// printer id -> { config, stop, status }
const printers = new Map();

// Settings that need a new connection when they change. Renaming doesn't.
const connectionKey = (p) => JSON.stringify([p.type, p.host, p.serial, p.access_code]);

function startWatching(config) {
  const entry = { config, status: { state: 'offline' }, stop: () => {} };
  const log = (msg) => console.log(`[${config.name}] ${msg}`);
  if (!WATCHERS[config.type]) {
    log(`unknown printer type "${config.type}"`);
  } else if (config.type === 'bambu' && !config.access_code) {
    log('no access code set');
  } else {
    entry.stop = WATCHERS[config.type](
      config,
      (status) => {
        if (JSON.stringify(entry.status) === JSON.stringify(status)) {
          return;
        }
        if (entry.status.state !== status.state) {
          log(`${entry.status.state} -> ${status.state}`);
        }
        entry.status = status;
        schedulePost();
      },
      log,
    );
  }
  printers.set(config.id, entry);
}

async function syncConfig() {
  let list;
  try {
    const res = await fetch(api('/printer_config'), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    list = (await res.json()).printers;
  } catch (err) {
    console.error(`could not fetch printers: ${err.message}`);
    return;
  }

  const seen = new Set();
  for (const config of list) {
    seen.add(config.id);
    const current = printers.get(config.id);
    if (current && connectionKey(current.config) === connectionKey(config)) {
      current.config = config;
      continue;
    }
    if (current) {
      console.log(`[${config.name}] settings changed, reconnecting`);
      current.stop();
    } else {
      console.log(`[${config.name}] watching ${config.type} printer at ${config.host}`);
    }
    startWatching(config);
  }
  for (const [id, entry] of printers) {
    if (!seen.has(id)) {
      console.log(`[${entry.config.name}] removed`);
      entry.stop();
      printers.delete(id);
    }
  }
}

let lastPostAt = 0;
let postTimer = null;
let posting = false;

async function post() {
  postTimer = null;
  if (posting) {
    schedulePost();
    return;
  }
  if (printers.size === 0) {
    return;
  }
  posting = true;
  lastPostAt = Date.now();
  const reports = [...printers].map(([id, entry]) => ({ id, ...entry.status }));
  try {
    const res = await fetch(api('/printer_status'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ printers: reports }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`post failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`post failed: ${err.message}`);
  } finally {
    posting = false;
  }
}

function schedulePost() {
  if (postTimer) {
    return;
  }
  postTimer = setTimeout(post, Math.max(0, lastPostAt + MIN_POST_INTERVAL_MS - Date.now()));
}

console.log(`printer bridge reporting to ${api('')}`);
await syncConfig();
post();
const configTimer = setInterval(syncConfig, CONFIG_POLL_MS);
const heartbeat = setInterval(post, HEARTBEAT_MS);

function shutdown() {
  clearInterval(configTimer);
  clearInterval(heartbeat);
  for (const entry of printers.values()) {
    entry.stop();
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
