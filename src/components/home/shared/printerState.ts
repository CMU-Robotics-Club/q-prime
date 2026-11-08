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

export function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) {
    return `${mins}m`;
  }
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
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
    state,
    displayState: (inUse ? 'in_use' : state) as DisplayState,
    // no job running and nobody sent to it: an officer can send a team here
    isFree: !hasJob && !inUse,
    inUse,
    detail,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How long until a printer on this queue line is free for a team with
 * `teamsAhead` teams in front of it, or null without the data to say.
 *
 * Each printer frees up when its print ends (by its own estimate), right away
 * if it's free, or after a typical print if a team was just sent to it. Each
 * team ahead takes the next printer to free up and keeps it for a typical
 * print: the median length of this line's recent and running jobs. Offline
 * printers and ones with errors don't count.
 */
export function estimatePrinterWaitMs(
  printers: PrinterStatusRow[],
  assignmentId: string,
  teamsAhead: number,
  now: number,
) {
  const line = printers.filter((p) => p.assignment_id === assignmentId);
  const jobLengths = line.flatMap((p) => [
    ...(p.recent_job_secs ?? []),
    ...(p.job_sec !== undefined ? [p.job_sec] : []),
  ]);
  const typicalMs = jobLengths.length > 0 ? median(jobLengths) * 1000 : null;

  const freeAt: number[] = [];
  for (const printer of line) {
    const view = describePrinter(printer, now);
    const remainingMs = (printer.remaining_sec ?? 0) * 1000;
    if (view.state === 'offline' || view.state === 'error') {
      continue;
    } else if (view.isFree) {
      freeAt.push(now);
    } else if (view.inUse) {
      if (typicalMs !== null) {
        freeAt.push(printer.in_use_since! + typicalMs);
      }
    } else if (view.state === 'printing' && remainingMs > 0) {
      // the printer's estimate was as of its last report
      freeAt.push(printer.updated_at + remainingMs);
    } else if (view.state === 'paused' && remainingMs > 0) {
      freeAt.push(now + remainingMs);
    } else {
      // preparing, or printing without a time yet
      const jobMs = printer.job_sec !== undefined ? printer.job_sec * 1000 : typicalMs;
      if (jobMs !== null) {
        freeAt.push(now + jobMs);
      }
    }
  }

  // Past the printers we know about, we need a typical print length.
  if (freeAt.length === 0 || (teamsAhead >= freeAt.length && typicalMs === null)) {
    return null;
  }
  const slots = freeAt.map((t) => Math.max(t, now)).sort((a, b) => a - b);
  for (let i = 0; i < teamsAhead; i++) {
    const t = slots.shift()!;
    if (typicalMs !== null) {
      slots.push(t + typicalMs);
      slots.sort((a, b) => a - b);
    }
  }
  return slots[0] - now;
}
