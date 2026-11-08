import { useEffect, useState } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t, s } from '../../../themes/styles';

// The printer bridge reports at least once a minute, so anything older means
// the bridge or the printer has stopped reporting.
const STALE_AFTER_MS = 3 * 60 * 1000;

type PrinterState = 'idle' | 'preparing' | 'printing' | 'paused' | 'finished' | 'error' | 'offline';
// What the card shows: the printer's state, or "in use" when an officer has
// sent a team to it and it hasn't started a job yet.
type DisplayState = PrinterState | 'in_use';

// States with a job running; these clear the in-use mark and can't be marked.
const ACTIVE_STATES: PrinterState[] = ['preparing', 'printing', 'paused'];
// A mark nobody started a job under expires after this. Keep in sync with
// IN_USE_EXPIRES_MS in convex/printers.ts, which clears it from the database.
const IN_USE_EXPIRES_MS = 30 * 60 * 1000;

const STATE_LABELS: Record<DisplayState, string> = {
  in_use: 'In use',
  idle: 'Idle',
  preparing: 'Preparing',
  printing: 'Printing',
  paused: 'Paused',
  finished: 'Finished',
  error: 'Error',
  offline: 'Offline',
};

const STATE_COLORS: Record<DisplayState, string> = {
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

// Each printer's state and, while it's printing, when it will be done. Live
// status comes from printer-bridge/; hidden when no printers report. Officers
// click a free printer to mark it in use for the team they're sending to it.
export default function PrinterStatus() {
  const courseId = useCourseId();
  const printers = useQuery(api.printers.getPrinterStatus, { courseId });
  const userData = useQuery(api.home.home_get.getUserData, { courseId });
  const isOfficer = userData?.user_kind === 'TA';
  const setInUse = useMutation(api.printers.setPrinterInUse);

  // Count down between reports, and notice when reports stop.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  if (!printers || printers.length === 0) {
    return null;
  }

  return (
    <div>
      <BaseCard>
        <Box sx={s.cardHeader}>
          <Box>
            <Box component="h2" sx={t.cardTitle}>
              Printers
            </Box>
            {isOfficer && (
              <Typography sx={[t.bodyMuted, { mt: 0.5 }]}>
                Click a free printer to mark it in use for the team you're sending to it.
              </Typography>
            )}
          </Box>
        </Box>
        <Divider />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 1.5,
            p: 2,
          }}
        >
          {printers.map((printer) => {
            const state: PrinterState =
              now - printer.updated_at > STALE_AFTER_MS ? 'offline' : printer.state;
            // Printers report 0 while preparing, so only show a time once it's known.
            const remainingSec =
              printer.remaining_sec !== undefined && printer.remaining_sec > 0
                ? printer.remaining_sec
                : null;
            // The estimate was as of the last report, so count down from there.
            const doneAt =
              state === 'printing' && remainingSec !== null
                ? printer.updated_at + remainingSec * 1000
                : null;
            const hasJob = ACTIVE_STATES.includes(state);
            const inUseSince =
              !hasJob &&
              printer.in_use_since !== undefined &&
              now - printer.in_use_since < IN_USE_EXPIRES_MS
                ? printer.in_use_since
                : undefined;
            const displayState: DisplayState = inUseSince !== undefined ? 'in_use' : state;
            // Officers mark a free printer in use, or click again to free it.
            const toggle =
              isOfficer && !hasJob
                ? () =>
                    setInUse({ courseId, printerId: printer._id, in_use: inUseSince === undefined })
                : undefined;

            return (
              <Box
                key={printer._id}
                sx={[
                  s.hairlineBox,
                  toggle !== undefined && {
                    cursor: 'pointer',
                    '&:hover, &:focus-visible': { borderColor: 'forest.main', outline: 'none' },
                  },
                ]}
                {...(toggle && {
                  role: 'button',
                  tabIndex: 0,
                  title: inUseSince === undefined ? 'Mark in use' : 'Mark free',
                  onClick: toggle,
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle();
                    }
                  },
                })}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  spacing={1}
                >
                  <Typography sx={[t.studentName, { minWidth: 0, overflowWrap: 'anywhere' }]}>
                    {printer.name}
                  </Typography>
                  <Box sx={[t.monoTag, { color: STATE_COLORS[displayState], flexShrink: 0 }]}>
                    {STATE_LABELS[displayState]}
                  </Box>
                </Stack>
                {inUseSince !== undefined && (
                  <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
                    {now - inUseSince < 60 * 1000
                      ? 'Marked just now'
                      : `Marked ${formatDuration(now - inUseSince)} ago`}
                  </Typography>
                )}
                {doneAt !== null && (
                  <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
                    Done ~
                    {new Date(Math.max(doneAt, now)).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {formatDuration(doneAt - now)} left
                  </Typography>
                )}
                {state === 'paused' && remainingSec !== null && (
                  <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
                    {formatDuration(remainingSec * 1000)} left when resumed
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </BaseCard>
    </div>
  );
}
