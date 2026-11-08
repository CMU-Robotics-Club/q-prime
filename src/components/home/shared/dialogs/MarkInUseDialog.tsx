import { useEffect, useState } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';

import DialogShell from '../../../common/dialogs/DialogShell';
import OhqButton from '../../../common/buttons/OhqButton';

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useCourseId } from '../../../../contexts/CourseContext';
import { t } from '../../../../themes/styles';

const FORM_ID = 'mark-printer-in-use-form';

// Officer-only: mark a free printer in use for a team. Teams that are
// currently called are one click; any other team number can be typed in.
export default function MarkInUseDialog(props: {
  printer: { _id: Id<'printers'>; name: string } | null;
  onClose: () => void;
}) {
  const { printer, onClose } = props;
  const courseId = useCourseId();
  const queue = useQuery(api.home.home_get.getAllStudents, printer ? { courseId } : 'skip');
  const setInUse = useMutation(api.printers.setPrinterInUse);
  const [teamNumber, setTeamNumber] = useState('');

  useEffect(() => {
    setTeamNumber('');
  }, [printer?._id]);

  const calledTeams = [
    ...new Set(
      (queue ?? [])
        .filter((entry) => entry.status === 'being_helped' && entry.team_number !== undefined)
        .map((entry) => entry.team_number!),
    ),
  ].sort((a, b) => a - b);

  const mark = async (team?: number) => {
    await setInUse({ courseId, printerId: printer!._id, in_use: true, team_number: team });
    onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    mark(teamNumber === '' ? undefined : Number(teamNumber));
  };

  return (
    <DialogShell
      open={printer !== null}
      onClose={onClose}
      title={`Mark ${printer?.name ?? 'printer'} in use`}
      subtitle="Which team is using it?"
      primaryAction={{ label: 'Mark in use', type: 'submit', formId: FORM_ID }}
      secondaryAction={{ label: 'Cancel', onClick: onClose }}
    >
      <Box component="form" id={FORM_ID} onSubmit={handleSubmit}>
        {calledTeams.length > 0 && (
          <>
            <Typography sx={t.monoLabel}>Called now</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75, mb: 2 }}>
              {calledTeams.map((team) => (
                <OhqButton key={team} variant="ghost" onClick={() => mark(team)}>
                  Team {team}
                </OhqButton>
              ))}
            </Stack>
          </>
        )}
        <TextField
          fullWidth
          variant="outlined"
          label="Team number"
          value={teamNumber}
          // digits only; leave blank to mark it without a team
          onChange={(e) => setTeamNumber(e.target.value.replace(/\D/g, ''))}
          helperText="Optional"
          inputProps={{ inputMode: 'numeric', maxLength: 6 }}
        />
      </Box>
    </DialogShell>
  );
}
