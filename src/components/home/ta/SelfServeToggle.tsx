import { FormControlLabel, Switch, Tooltip } from '@mui/material';

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';

export default function SelfServeToggle() {
  const courseId = useCourseId();
  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });
  const setSelfServeMode = useMutation(api.home.home_mutate.setSelfServeMode);

  return (
    <Tooltip title="Teams get notified when they reach the front of their machine's line and remove themselves once their print starts">
      <FormControlLabel
        label="Self-serve"
        control={
          <Switch
            size="small"
            checked={queueData?.self_serve_mode ?? false}
            disabled={!queueData}
            onChange={(event) => setSelfServeMode({ courseId, enabled: event.target.checked })}
          />
        }
        sx={{ mr: 0 }}
      />
    </Tooltip>
  );
}
