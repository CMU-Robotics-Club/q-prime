import { useMemo } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';

import BaseCard from '../../common/cards/BaseCard';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useCourseId } from '../../../contexts/CourseContext';
import { t, s } from '../../../themes/styles';

// Logged-out view of the queue: each machine's line by team number.
export default function PublicQueue() {
  const courseId = useCourseId();
  const entries = useQuery(api.home.home_get.getPublicQueue, { courseId });

  const machines = useMemo(() => {
    const byMachine = new Map<string, { name: string; entries: NonNullable<typeof entries> }>();
    for (const entry of entries ?? []) {
      const machine = byMachine.get(entry.assignment_id);
      if (machine) {
        machine.entries.push(entry);
      } else {
        byMachine.set(entry.assignment_id, { name: entry.assignment_name, entries: [entry] });
      }
    }
    return [...byMachine.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [entries]);

  return (
    <div>
      <BaseCard>
        <Box sx={s.cardHeader}>
          <Box component="h2" sx={t.cardTitle}>
            Queue
          </Box>
        </Box>
        <Divider />
        {machines.length === 0 ? (
          <Typography sx={[t.bodyMuted, { px: 2.75, py: 2 }]}>
            {entries ? 'No teams are on the queue.' : 'Loading…'}
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 2,
              p: 2,
            }}
          >
            {machines.map(([assignmentId, machine]) => (
              <Box key={assignmentId} sx={s.hairlineBox}>
                <Typography sx={t.monoTag}>[{machine.name}]</Typography>
                <Stack component="ol" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
                  {machine.entries.map((entry) => (
                    <Stack
                      component="li"
                      key={entry.machine_position}
                      direction="row"
                      alignItems="baseline"
                      spacing={1.5}
                    >
                      <Box sx={[t.monoLabel, { minWidth: 24 }]}>#{entry.machine_position}</Box>
                      <Typography sx={[t.studentName, { flex: 1 }]}>
                        {entry.team_number !== undefined
                          ? `Team ${entry.team_number}`
                          : 'No team #'}
                      </Typography>
                      {entry.is_called && (
                        <Box sx={[t.monoTag, { color: 'forest.main' }]}>called</Box>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </BaseCard>
    </div>
  );
}
