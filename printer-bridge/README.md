# Printer bridge

Shows each printer's state and time left on the queue's home page. Admins add
printers in **Settings > Printer Settings**. The bridge runs next to the backend on the
server, fetches that list from the backend every 30 seconds, reads each
printer's status over the local network, and reports it back about once a
minute (sooner when something changes). It only reads status: it never sends
print or control commands.

- **Bambu Lab** (X1, H2, P1, A1): the printer's local MQTT server on port 8883,
  over TLS verified against Bambu's CAs in `certs/`. Needs the printer's LAN
  access code. The serial number is optional; the bridge reads it from the
  printer's certificate. Works with the printer still connected to Bambu Cloud:
  leave LAN Only mode and Developer Mode off (tested on an H2S).
- **Elegoo Centauri Carbon**: SDCP over WebSocket on port 3030. No credentials.
  The printer allows about 4 connections at once (its camera stream uses one),
  and the bridge holds one.

The home page shows a printer as Offline until the bridge reports it, and again
when the bridge hasn't heard from it for 3 minutes.

## Adding a printer

In **Settings > Printer Settings**, add the printer's name, type, host name
or IP address, and the queue line (machine) it serves. Wait estimates for that
line use the printer: when it will be free, and how long its jobs usually take
(the bridge reports each job's length). For a Bambu printer, also enter the 8-character LAN access code from
the printer's network settings on its screen (next to the LAN Only option; just
read it, don't turn LAN Only on). The code changes after a factory reset.
Admins can see access codes in Settings and in the CSV download. **Download CSV**
and **Upload CSV** there add or update several printers at once; rows match
printers by name, and a blank access code keeps the current one.

## Running the bridge (on the server, in the q-prime checkout)

1. Pick a shared secret and give it to both the backend and the bridge:
   ```bash
   SECRET=$(openssl rand -hex 32)
   echo "PRINTER_BRIDGE_SECRET=$SECRET" >> .env.docker
   set -a; source .env.docker; set +a
   npx convex env set PRINTER_BRIDGE_SECRET -- "$SECRET"
   ```
2. Deploy the backend if it isn't already (`./docker/scripts/deploy-convex.sh`),
   then start the bridge:
   ```bash
   docker compose -f docker/docker-compose.yml --env-file .env.docker --profile printers up -d --build printer-bridge
   docker logs -f qprime-printer-bridge
   ```
   The log shows each printer connecting and its state changes. Printers added
   or changed in Settings are picked up within 30 seconds; no restart needed.
