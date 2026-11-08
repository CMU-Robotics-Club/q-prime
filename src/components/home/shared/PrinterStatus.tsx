import { useState } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';
import MarkInUseDialog from './dialogs/MarkInUseDialog';
import {
  describePrinter,
  PrinterStatusRow,
  STATE_COLORS,
  STATE_LABELS,
  useNow,
} from './printerState';

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t, s } from '../../../themes/styles';

// Each printer's state and, while it's printing, when it will be done. Live
// status comes from printer-bridge/; hidden when no printers report. Officers
// click a free printer to mark it in use for the team they're sending to it.
export default function PrinterStatus() {
  const courseId = useCourseId();
  const printers = useQuery(api.printers.getPrinterStatus, { courseId });
  const userData = useQuery(api.home.home_get.getUserData, { courseId });
  const isOfficer = userData?.user_kind === 'TA';
  const setInUse = useMutation(api.printers.setPrinterInUse);
  const now = useNow();
  const [marking, setMarking] = useState<PrinterStatusRow | null>(null);

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
            const view = describePrinter(printer, now);
            // Officers mark a free printer in use, or click an in-use one to free it.
            const onClick = !isOfficer
              ? undefined
              : view.isFree
                ? () => setMarking(printer)
                : view.inUse
                  ? () => setInUse({ courseId, printerId: printer._id, in_use: false })
                  : undefined;

            return (
              <Box
                key={printer._id}
                sx={[
                  s.hairlineBox,
                  onClick !== undefined && {
                    cursor: 'pointer',
                    '&:hover, &:focus-visible': { borderColor: 'forest.main', outline: 'none' },
                  },
                ]}
                {...(onClick && {
                  role: 'button',
                  tabIndex: 0,
                  title: view.inUse ? 'Mark free' : 'Mark in use',
                  onClick,
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onClick();
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
                  <Box sx={[t.monoTag, { color: STATE_COLORS[view.displayState], flexShrink: 0 }]}>
                    {STATE_LABELS[view.displayState]}
                  </Box>
                </Stack>
                {view.detail && (
                  <Typography sx={[t.bodySmall, { mt: 0.5 }]}>{view.detail}</Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </BaseCard>

      {isOfficer && <MarkInUseDialog printer={marking} onClose={() => setMarking(null)} />}
    </div>
  );
}
