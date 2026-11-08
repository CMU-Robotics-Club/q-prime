import { Box, CardContent, Divider, Stack, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';

import BaseCard from '../../common/cards/BaseCard';
import OhqButton from '../../common/buttons/OhqButton';
import LinkifiedText from '../../common/LinkifiedText';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t, s } from '../../../themes/styles';
import { estimatePrinterWaitMs, formatDuration, useNow } from '../shared/printerState';

export default function YourEntry(props) {
  const { openRemoveOverlay } = props;
  const courseId = useCourseId();

  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });
  const userData = useQuery(api.home.home_get.getUserData, { courseId });
  const printers = useQuery(api.printers.getPrinterStatus, { courseId });
  const studentData = userData?.student_data;
  const now = useNow();

  const cooldownMsg = queueData?.allow_cooldown_override
    ? 'Frozen in line — you will not advance until an officer approves your request.'
    : 'Frozen in line — wait for your cooldown to end before joining the queue again.';

  // Place in line for this team's machine. Teams ahead count until they leave
  // the queue, even after they've been called.
  const position = userData?.machine_position ?? 0;
  const teamsAhead = Math.max(position - 1, 0);

  // Teams that still have to be called before this one, times how often this
  // machine has been calling teams. No estimate until it has called a few.
  const waitingAhead = userData?.waiting_ahead ?? teamsAhead;
  const minsPerCall = queueData?.mins_per_call_by_machine?.find(
    (m) => m.assignment_id === studentData?.assignment_id,
  )?.mins_per_call;
  const estimatedMins =
    minsPerCall === undefined ? null : Math.max(1, Math.round(waitingAhead * minsPerCall));

  // On a line with printers, estimate from when they'll actually be free: every
  // team ahead (called or not) still needs one.
  const printerWaitMs =
    printers && studentData
      ? estimatePrinterWaitMs(printers, studentData.assignment_id, teamsAhead, now)
      : null;

  // Self-serve has no officer call times to estimate from, so show the line length instead.
  const selfServe = queueData?.self_serve_mode ?? false;
  const teamsAheadText = `${teamsAhead} team${teamsAhead === 1 ? '' : 's'} ahead of you`;
  let lineText = teamsAheadText;
  if (studentData?.status === 'being_helped' && !selfServe) {
    lineText = "You've been called";
  } else if (printerWaitMs !== null) {
    lineText =
      printerWaitMs < 60 * 1000
        ? 'A printer is free for you'
        : `~${formatDuration(printerWaitMs)} until a printer is free`;
  } else if (!selfServe) {
    if (waitingAhead === 0) {
      lineText = "You're next to be called";
    } else if (estimatedMins !== null) {
      lineText = `~${estimatedMins} minute${estimatedMins === 1 ? '' : 's'} wait`;
    }
  }
  const isNextUp = selfServe && position === 1 && studentData?.status === 'waiting';

  const isPaused =
    studentData &&
    (studentData.status === 'fixing_question' ||
      studentData.status === 'frozen' ||
      studentData.status === 'cooldown_violation');

  return (
    <BaseCard>
      <CardContent sx={{ p: '20px 24px' }}>
        <Stack direction="row" alignItems="flex-start" spacing={2.5}>
          <Box className="ohq-position-num" sx={t.positionNum}>
            #{position}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, alignSelf: 'center' }}>
            <Typography
              sx={(theme) => ({
                fontFamily: theme.fonts.ui,
                fontWeight: 600,
                fontSize: 20,
                color: theme.palette.ink.primary,
                lineHeight: 1.3,
              })}
            >
              {lineText}
            </Typography>
            <Typography sx={[t.bodyMuted, { mt: 0.25 }]}>
              in line for {studentData?.assignment_name || 'your machine'}
            </Typography>
          </Box>
          <OhqButton variant="icon" tone="danger" aria-label="remove" onClick={openRemoveOverlay}>
            <DeleteIcon fontSize="small" />
          </OhqButton>
        </Stack>

        {isNextUp && (
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.forest.main}`,
              borderRadius: '4px',
              p: 1.25,
              mt: 2,
            })}
          >
            <Typography sx={{ fontSize: 13.5, color: 'ink.primary' }}>
              You're at the front of the line. When a machine opens up, start your print, then
              remove your team from the queue with the trash button.
            </Typography>
          </Box>
        )}

        {isPaused && (
          <Box sx={[s.amberWarning, { mt: 2 }]}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <PauseIcon sx={{ color: 'amber.main', fontSize: 20 }} />
              <Typography sx={{ fontSize: 13.5, color: 'ink.primary' }}>{cooldownMsg}</Typography>
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {studentData?.team_number !== undefined && (
            <Box>
              <Box sx={t.monoLabel}>[team]</Box>
              <Typography sx={{ fontSize: 14, color: 'ink.primary' }}>
                {studentData.team_number}
              </Typography>
            </Box>
          )}
          {studentData?.phone_number !== undefined && (
            <Box>
              <Box sx={t.monoLabel}>[phone]</Box>
              <Typography sx={{ fontSize: 14, color: 'ink.primary' }}>
                {studentData.phone_number}
              </Typography>
            </Box>
          )}
          <Box>
            <Box sx={t.monoLabel}>[location]</Box>
            <Typography sx={{ fontSize: 14, color: 'ink.primary' }}>
              {studentData?.location || ''}
            </Typography>
          </Box>
          <Box>
            <Box sx={t.monoLabel}>[machine]</Box>
            <Typography sx={{ fontSize: 14, color: 'ink.primary' }}>
              {studentData?.assignment_name || ''}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Box sx={t.monoLabel}>PART</Box>
        <Typography sx={[t.body, { mt: 0.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }]}>
          <LinkifiedText>{studentData?.question || ''}</LinkifiedText>
        </Typography>
      </CardContent>
    </BaseCard>
  );
}
