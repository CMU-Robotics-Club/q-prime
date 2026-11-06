import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import Linkify from 'linkify-react';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';

import DialogShell from '../../common/dialogs/DialogShell';
import HelpTimer from '../../common/timer/HelpTimer';

export default function TAHelpingOverlay(props: { open: boolean }) {
  const { open } = props;
  const courseId = useCourseId();

  const userData = useQuery(api.home.home_get.getUserData, { courseId });
  const studentData = userData?.student_data;

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!open) setDismissed(false);
  }, [open]);

  const taName = studentData?.helping_ta?.preferred_name || 'An officer';
  const machineName = studentData?.assignment_name || 'machine';

  return (
    <DialogShell
      open={open && !dismissed}
      onClose={() => setDismissed(true)}
      title={`${taName} is ready for your team`}
      secondaryAction={{ label: 'Got it', onClick: () => setDismissed(true) }}
    >
      <Box>
        <Typography sx={{ fontSize: 14, color: 'ink.primary', mb: 2 }}>
          Head to the <b>{machineName}</b> with your files.
        </Typography>
        {studentData?.question && (
          <Typography sx={{ fontSize: 14, color: 'ink.secondary', mb: 2 }}>
            Part: <Linkify options={{ target: '_blank' }}>{studentData.question}</Linkify>
          </Typography>
        )}
        {studentData?.help_start_time_ms && (
          <HelpTimer startTime={studentData.help_start_time_ms} />
        )}
      </Box>
    </DialogShell>
  );
}
