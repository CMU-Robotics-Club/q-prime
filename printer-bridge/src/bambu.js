// Bambu Lab printers (X1, H2, P1, A1): read-only status over the printer's
// local MQTT server. The only message we send is "pushall", which asks the
// printer for a full status report; we never send control commands.
//
// Protocol: https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md
// Reference client: https://github.com/greghesp/ha-bambulab (pybambu)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';

// Bambu's device CAs, from ha-bambulab (MIT). Printers present a certificate
// whose CN is their serial number, signed by one of these.
const CERTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'certs');
const BAMBU_CAS = readdirSync(CERTS_DIR)
  .filter((f) => f.endsWith('.pem'))
  .map((f) => readFileSync(join(CERTS_DIR, f), 'utf8'));

const STATES = {
  IDLE: 'idle',
  INIT: 'preparing',
  SLICING: 'preparing',
  PREPARE: 'preparing',
  RUNNING: 'printing',
  PAUSE: 'paused',
  FINISH: 'finished',
  FAILED: 'error',
};

// print_error codes that mean someone cancelled the print, which the printer
// reports as FAILED.
const CANCELLED_ERRORS = [0x0300400c, 0x0500400e];

// Ask for a full report this often as well as on connect, in case a partial
// update was missed. Bambu warns against doing it much more often.
const PUSHALL_MS = 10 * 60_000;

export function normalizeBambu(report) {
  if (report.gcode_state === undefined) {
    return { state: 'offline' };
  }
  const cancelled =
    report.gcode_state === 'FAILED' && CANCELLED_ERRORS.includes(report.print_error);
  const minutes = report.mc_remaining_time;
  return {
    state: cancelled ? 'idle' : (STATES[report.gcode_state] ?? 'idle'),
    remaining_sec:
      typeof minutes === 'number' && Number.isFinite(minutes) ? minutes * 60 : undefined,
  };
}

/**
 * Watch one Bambu printer. Calls onStatus(status) with a normalized status
 * whenever a report arrives or the connection drops.
 */
export function watchBambu(printer, onStatus, log) {
  const { host, access_code: accessCode } = printer;
  // Admins can leave the serial blank; it's then taken from the printer's
  // certificate once that has verified against Bambu's CAs.
  let serial = printer.serial ?? null;
  // Some printers only send changed fields, so merge every report into one.
  let report = {};
  const requestFullReport = () =>
    client.publish(
      `device/${serial}/request`,
      JSON.stringify({
        pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 },
      }),
    );

  const client = mqtt.connect(`mqtts://${host}:8883`, {
    username: 'bblp',
    password: accessCode,
    clientId: `qprime-bridge-${Math.random().toString(16).slice(2, 10)}`,
    protocolVersion: 4,
    reconnectPeriod: 15_000,
    connectTimeout: 15_000,
    // Without a ping answer for this long, mqtt.js drops the connection.
    keepalive: 30,
    ca: BAMBU_CAS,
    ...(serial ? { servername: serial } : {}),
    rejectUnauthorized: true,
    // The certificate names the printer's serial, not its host name. Node only
    // calls this once the chain has verified against the CAs above.
    checkServerIdentity: (_host, cert) => {
      const certSerial = cert.subject?.CN;
      if (serial && certSerial !== serial) {
        return new Error(`certificate is for ${certSerial}, expected serial ${serial}`);
      }
      if (!serial && certSerial) {
        serial = certSerial;
        log(`serial ${serial}`);
      }
      return undefined;
    },
    // Some Bambu firmware never answers a TLS 1.3 handshake (ha-bambulab caps it too).
    maxVersion: 'TLSv1.2',
  });

  client.on('connect', () => {
    log(`connected`);
    report = {};
    client.subscribe(`device/${serial}/report`, (err) => {
      if (err) {
        log(`subscribe failed: ${err.message}`);
        return;
      }
      requestFullReport();
    });
  });
  const pushallTimer = setInterval(() => client.connected && requestFullReport(), PUSHALL_MS);

  client.on('message', (_topic, payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (message.print && typeof message.print === 'object') {
      report = { ...report, ...message.print };
      onStatus(normalizeBambu(report));
    }
  });

  const markOffline = () => onStatus({ state: 'offline' });
  client.on('close', markOffline);
  client.on('offline', markOffline);
  client.on('error', (err) => log(`error: ${err.message}`));

  return () => {
    clearInterval(pushallTimer);
    client.end(true);
  };
}
