import { Box, Divider, Typography, useTheme } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t } from '../../../themes/styles';
import { estimatePrinterWaitMs, formatDuration, useNow } from './printerState';

export default function QueueStats() {
  const theme = useTheme();
  const courseId = useCourseId();

  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });
  const printers = useQuery(api.printers.getPrinterStatus, { courseId });
  const lineEntries = useQuery(api.home.home_get.getPublicQueue, { courseId });
  const now = useNow();
  const isFrozen = queueData?.is_frozen ?? true;
  const numStudents = queueData?.num_students || 0;
  // Every waiting team gets called before a team joining now. Hidden until
  // enough teams have been called to tell how often that happens.
  const eta =
    queueData && queueData.mins_per_call !== null
      ? Math.round(queueData.num_unhelped * queueData.mins_per_call)
      : null;

  // Wait for a team joining now, per queue line: on a line with printers, from
  // when they'll be free (everyone in line needs one first); otherwise from how
  // often the line calls teams. Lines with neither are left out.
  const lineEstimates = (queueData?.current_assignments ?? []).flatMap((machine) => {
    const entries = (lineEntries ?? []).filter((e) => e.assignment_id === machine._id);
    let waitMs = printers
      ? estimatePrinterWaitMs(printers, machine._id, entries.length, now)
      : null;
    if (waitMs === null) {
      const minsPerCall = queueData?.mins_per_call_by_machine?.find(
        (m) => m.assignment_id === machine._id,
      )?.mins_per_call;
      if (minsPerCall === undefined) {
        return [];
      }
      waitMs = entries.filter((e) => !e.is_called).length * minsPerCall * 60 * 1000;
    }
    return [
      { name: machine.name, text: waitMs < 60 * 1000 ? 'no wait' : `~${formatDuration(waitMs)}` },
    ];
  });

  return (
    <Box
      sx={(theme) => ({
        '@media (max-width: 700px)': {
          borderTop: `1px solid ${theme.palette.rule.default}`,
          pt: 1.5,
        },
      })}
    >
      <BaseCard>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
            alignItems: 'center',
            gap: { xs: 1, sm: 2.25 },
            px: 2.75,
            py: 1.75,
          }}
        >
          <Box>
            <Typography sx={[t.cardTitle, { lineHeight: 1.15 }]}>
              The queue is{' '}
              <Box
                component="span"
                sx={{
                  color: isFrozen ? theme.palette.error.main : theme.palette.success.main,
                }}
              >
                {isFrozen ? 'CLOSED' : 'OPEN'}
              </Box>
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Box>
            <Typography sx={t.bodySmall}>
              There {numStudents === 1 ? 'is' : 'are'}{' '}
              <Box component="strong" sx={{ fontWeight: 700, color: 'ink.primary' }}>
                {numStudents} team{numStudents === 1 ? '' : 's'}
              </Box>{' '}
              on the queue.
            </Typography>
            {lineEstimates.length > 0 ? (
              <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
                Estimated wait to join now:{' '}
                {lineEstimates.map((line, i) => (
                  <Box component="span" key={line.name}>
                    {i > 0 && ' · '}
                    {line.name}{' '}
                    <Box component="strong" sx={{ fontWeight: 700, color: 'ink.primary' }}>
                      {line.text}
                    </Box>
                  </Box>
                ))}
              </Typography>
            ) : (
              eta !== null && (
                <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
                  Estimated wait time is{' '}
                  <Box component="strong" sx={{ fontWeight: 700, color: 'ink.primary' }}>
                    ~{eta} minute{eta === 1 ? '' : 's'}
                  </Box>{' '}
                  from the end.
                </Typography>
              )
            )}
          </Box>
        </Box>
      </BaseCard>
    </Box>
  );
}
