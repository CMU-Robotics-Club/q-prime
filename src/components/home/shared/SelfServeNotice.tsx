import { Box, Typography } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t } from '../../../themes/styles';

// Shown to everyone, logged in or not, while officers have self-serve mode on.
export default function SelfServeNotice() {
  const courseId = useCourseId();
  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });

  if (!queueData?.self_serve_mode) {
    return null;
  }

  return (
    <BaseCard>
      <Box sx={{ px: 2.75, py: 1.75 }}>
        <Typography sx={[t.cardTitle, { fontSize: 16, color: 'forest.main' }]}>
          Self-serve mode
        </Typography>
        <Typography sx={[t.bodySmall, { mt: 0.5 }]}>
          Officers aren't calling teams right now. When your team is first in line for a machine and
          you see one open, start your print, then remove your team from the queue.
        </Typography>
      </Box>
    </BaseCard>
  );
}
