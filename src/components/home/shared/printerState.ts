import { useEffect, useState } from 'react';
import { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';

// How the home page reads a printer's status from convex/printers.ts. Shared by
// the Printers card and the officer's "which printer?" dialog so they agree.

export type PrinterStatusRow = FunctionReturnType<typeof api.printers.getPrinterStatus>[number];
type PrinterState = PrinterStatusRow['state'];
// What we show: the printer's state, or "in use" when an officer has sent a
// team to it and it hasn't started a job yet.
export type DisplayState = PrinterState | 'in_use';

// The printer bridge reports at least once a minute, so anything older means
// the bridge or the printer has stopped reporting.
const STALE_AFTER_MS = 3 * 60 * 1000;
// A mark nobody started a job under expires after this. Keep in sync with
// IN_USE_EXPIRES_MS in convex/printers.ts, which clears it from the database.
const IN_USE_EXPIRES_MS = 30 * 60 * 1000;
// States with a job running; these clear the in-use mark and can't be marked.
const ACTIVE_STATES: PrinterState[] = ['preparing', 'printing', 'paused'];

export const STATE_LABELS: Record<DisplayState, string> = {
  in_use: 'In use',
  idle: 'Idle',
  preparing: 'Preparing',
  printing: 'Printing',
  paused: 'Paused',
  finished: 'Finished',
  error: 'Error',
  offline: 'Offline',
};

export const STATE_COLORS: Record<DisplayState, string> = {
  in_use: 'amber.main',
  idle: 'ink.muted',
  preparing: 'forest.main',
  printing: 'forest.main',
  paused: 'amber.main',
  finished: 'ink.secondary',
  error: 'error.main',
  offline: 'ink.muted',
};

function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** The current time, updated every 30s: counts down times and expires marks. */
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(intervalId);
  }, []);
  return now;
}

export function describePrinter(printer: PrinterStatusRow, now: number) {
  const state: PrinterState = now - printer.updated_at > STALE_AFTER_MS ? 'offline' : printer.state;
  const hasJob = ACTIVE_STATES.includes(state);
  const inUseSince =
    !hasJob && printer.in_use_since !== undefined && now - printer.in_use_since < IN_USE_EXPIRES_MS
      ? printer.in_use_since
      : undefined;
  const inUse = inUseSince !== undefined;
  // Printers report 0 while preparing, so only show a time once it's known.
  const remainingSec =
    printer.remaining_sec !== undefined && printer.remaining_sec > 0 ? printer.remaining_sec : null;

  // The line under the name.
  let detail: string | null = null;
  if (inUse) {
    const marked =
      now - inUseSince < 60 * 1000
        ? 'marked just now'
        : `marked ${formatDuration(now - inUseSince)} ago`;
    // marks from before teams were attached have none
    detail = printer.in_use_team !== undefined ? `Team ${printer.in_use_team} · ${marked}` : marked;
    detail = detail[0].toUpperCase() + detail.slice(1);
  } else if (state === 'printing' && remainingSec !== null) {
    // The estimate was as of the last report, so count down from there.
    const doneAt = printer.updated_at + remainingSec * 1000;
    const clock = new Date(Math.max(doneAt, now)).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    detail = `Done ~${clock} · ${formatDuration(doneAt - now)} left`;
  } else if (state === 'paused' && remainingSec !== null) {
    detail = `${formatDuration(remainingSec * 1000)} left when resumed`;
  }

  return {
    displayState: (inUse ? 'in_use' : state) as DisplayState,
    // no job running and nobody sent to it: an officer can send a team here
    isFree: !hasJob && !inUse,
    inUse,
    detail,
  };
}
