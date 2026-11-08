// Elegoo Centauri Carbon: read-only status over SDCP V3 (JSON over a
// WebSocket on port 3030, no credentials). The printer pushes status on its
// own; the only request we send is Cmd 0 (status refresh), which also keeps
// the connection open.
//
// Spec: https://github.com/cbd-tech/SDCP-Smart-Device-Control-Protocol-V3.0.0
// Centauri Carbon status codes: https://github.com/ELEGOO-3D/elegoo-link
// (src/lan/adapters/elegoo_fdm_cc/)

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { roundTo5Min } from './bambu.js';

// The printer closes a connection that sends nothing for about a minute; its
// own status pushes don't count. A status request every 20s keeps it open.
const REFRESH_MS = 20_000;
// No frame for this long means the link is dead.
const SILENCE_MS = 60_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// The printer allows about 4 connections (the camera stream uses one).
const TOO_MANY_CLIENTS_BACKOFF_MS = 120_000;

// PrintInfo.Status codes on the Centauri Carbon. Anything else while a job is
// running (homing, leveling, preheating, ...) counts as preparing.
const PRINTING = 13;
const RESUMING = 12;
const PAUSED = [5, 6, 26]; // pausing, paused, unload paused
const ERROR = [14, 25]; // stopped due to error, unload abnormal
const FINISHED = 9;
const CANCELLED = [7, 8]; // stopping, stopped

export function normalizeElegoo(status) {
  const info = status.PrintInfo ?? {};
  const code = info.Status;
  // CurrentStatus lists the machine's activities; 2 (file transfer) can come
  // first, so look at the rest too. 1 means a print job is running.
  const activities = Array.isArray(status.CurrentStatus) ? status.CurrentStatus : [];
  const jobActive = activities.includes(1);
  // Ticks are seconds on the Centauri Carbon. Round to the minute: the site
  // shows minutes, and every change is a post to the backend.
  const remaining =
    typeof info.TotalTicks === 'number' &&
    typeof info.CurrentTicks === 'number' &&
    info.TotalTicks > 0
      ? Math.max(0, Math.round((info.TotalTicks - info.CurrentTicks) / 60) * 60)
      : undefined;

  let state;
  if (ERROR.includes(code)) {
    state = 'error';
  } else if (PAUSED.includes(code)) {
    state = 'paused';
  } else if (code === FINISHED) {
    state = 'finished';
  } else if (CANCELLED.includes(code)) {
    state = 'idle';
  } else if (jobActive) {
    state = code === PRINTING || code === RESUMING ? 'printing' : 'preparing';
  } else {
    state = 'idle';
  }

  const active = state === 'printing' || state === 'paused' || state === 'preparing';
  // TotalTicks is the slicer's estimate of the whole job, in seconds.
  const job_sec =
    active && typeof info.TotalTicks === 'number' && info.TotalTicks > 0
      ? roundTo5Min(info.TotalTicks)
      : undefined;
  return { state, remaining_sec: active ? remaining : undefined, job_sec };
}

/**
 * Watch one Elegoo printer. Calls onStatus(status) with a normalized status
 * whenever the printer reports or the connection drops.
 */
export function watchElegoo(printer, onStatus, log) {
  let socket = null;
  let mainboardId = null;
  let refreshTimer = null;
  let silenceTimer = null;
  let reconnectTimer = null;
  let reconnectDelay = RECONNECT_MIN_MS;
  let stopped = false;

  function requestStatus() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !mainboardId) {
      return;
    }
    socket.send(
      JSON.stringify({
        Id: randomUUID().replaceAll('-', ''),
        Data: {
          Cmd: 0,
          Data: {},
          RequestID: randomUUID().replaceAll('-', ''),
          MainboardID: mainboardId,
          TimeStamp: Math.floor(Date.now() / 1000),
          From: 0,
        },
        Topic: `sdcp/request/${mainboardId}`,
      }),
    );
  }

  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      log('no status for 60s, reconnecting');
      socket?.terminate();
    }, SILENCE_MS);
  }

  function connect() {
    reconnectTimer = null;
    socket = new WebSocket(`ws://${printer.host}:3030/websocket`, { handshakeTimeout: 10_000 });
    let closeReason = '';

    socket.on('open', () => {
      log('connected');
      reconnectDelay = RECONNECT_MIN_MS;
      resetSilenceTimer();
      // The printer pushes a status frame right after connecting; that frame
      // carries the MainboardID that requests need.
      refreshTimer = setInterval(requestStatus, REFRESH_MS);
    });

    socket.on('message', (data) => {
      resetSilenceTimer();
      let frame;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return; // e.g. "pong"
      }
      if (typeof frame.MainboardID === 'string' && !mainboardId) {
        mainboardId = frame.MainboardID;
        requestStatus();
      }
      if (frame.Status && typeof frame.Status === 'object') {
        onStatus(normalizeElegoo(frame.Status));
      }
    });

    socket.on('close', (_code, reason) => {
      closeReason = reason?.toString() ?? '';
      clearInterval(refreshTimer);
      clearTimeout(silenceTimer);
      onStatus({ state: 'offline' });
      if (stopped) {
        return;
      }
      const delay = /too many client/i.test(closeReason)
        ? TOO_MANY_CLIENTS_BACKOFF_MS
        : reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      reconnectTimer = setTimeout(connect, delay);
    });

    socket.on('error', (err) => log(`error: ${err.message}`));
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    socket?.terminate();
  };
}
