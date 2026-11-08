import { useEffect, useState } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t, s } from '../../../themes/styles';

// The printer bridge reports at least once a minute, so anything older means
// the bridge or the printer has stopped reporting.
const STALE_AFTER_MS = 3 * 60 * 1000;

type PrinterState = 'idle' | 'preparing' | 'printing' | 'paused' | 'finished' | 'error' | 'offline';

const STATE_LABELS: Record<PrinterState, string> = {
  idle: 'Idle',
  preparing: 'Preparing',
  printing: 'Printing',
  paused: 'Paused',
  finished: 'Finished',
  error: 'Error',
  offline: 'Offline',
};

const STATE_COLORS: Record<PrinterState, string> = {
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
// status comes from printer-bridge/; hidden when no printers report.
export default function PrinterStatus() {
  const courseId = useCourseId();
  const printers = useQuery(api.printers.getPrinterStatus, { courseId });

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
          <Box component="h2" sx={t.cardTitle}>
            Printers
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

            return (
              <Box key={printer._id} sx={s.hairlineBox}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  spacing={1}
                >
                  <Typography sx={[t.studentName, { minWidth: 0, overflowWrap: 'anywhere' }]}>
                    {printer.name}
                  </Typography>
                  <Box sx={[t.monoTag, { color: STATE_COLORS[state], flexShrink: 0 }]}>
                    {STATE_LABELS[state]}
                  </Box>
                </Stack>
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
