import { useState, useEffect } from 'react';
import {
  Box,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';

import CooldownViolationOverlay from './CooldownViolationOverlay';
import BaseCard from '../../common/cards/BaseCard';
import OhqButton from '../../common/buttons/OhqButton';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useCourseId } from '../../../contexts/CourseContext';
import { t } from '../../../themes/styles';

// Keep in sync with MAX_PART_LENGTH in convex/home/home_mutate.ts.
const MAX_PART_LENGTH = 1000;
// Used when no locations are configured for today.
const DEFAULT_LOCATIONS = ['RoboClub'];

// Team numbers are positive whole numbers. The field only accepts digits, so
// this just rules out an empty value and "0".
function parseTeamNumber(value: string): number | null {
  const n = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export default function AskQuestion() {
  const courseId = useCourseId();
  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });
  const userData = useQuery(api.home.home_get.getUserData, { courseId });

  const currAssignments = queueData?.current_assignments || [];
  const isTA = userData?.user_kind === 'TA';

  const [teamNumber, setTeamNumber] = useState('');
  const [teamNumberError, setTeamNumberError] = useState(false);
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [assignmentId, setAssignmentId] = useState<Id<'assignments'> | null>(null);
  const [question, setQuestion] = useState('');

  const [showCooldownOverlay, setShowCooldownOverlay] = useState(false);
  const [timePassed, setTimePassed] = useState(0);

  const [askDisabled, setAskDisabled] = useState(false);

  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    if (queueData) {
      let new_locations = queueData.current_locations;
      if (new_locations.length === 0) {
        new_locations = DEFAULT_LOCATIONS;
      }
      if (new_locations.length === 1) {
        setLocation(new_locations[0]);
      }
      setLocations(new_locations);
    }
  }, [queueData]);

  useEffect(() => {
    if (currAssignments && currAssignments.length === 1) {
      setAssignmentId(currAssignments[0]._id);
    }
  }, [currAssignments]);

  useEffect(() => {
    if (userData && userData.user_kind === 'student') {
      setEmail(userData.email);
    }
  }, [userData]);

  function handleSubmit(event) {
    event.preventDefault();
    const team_number = parseTeamNumber(teamNumber);
    if (team_number === null) {
      setTeamNumberError(true);
      return;
    }
    setAskDisabled(true);
    callAddQuestionAPI(team_number);
  }

  const addQuestionMutation = useMutation(api.home.home_mutate.addQuestion);
  async function callAddQuestionAPI(team_number: number) {
    // Re-enable Submit however this ends; errors still reach ConvexErrorProvider.
    try {
      const result = await addQuestionMutation({
        courseId,
        question,
        location,
        assignment_id: assignmentId!,
        team_number,
        override_cooldown: false,
        email: email.trim(),
      });

      if (result.code === 'COOLDOWN_VIOLATION') {
        if (!result.data) {
          throw new Error('Cooldown violation result data is undefined');
        }

        setTimePassed(Math.round(result.data.waited_time_ms / 1000 / 60));
        setShowCooldownOverlay(true);
      } else if (result.code === 'SUCCESS') {
        clearValues();
      } else {
        throw new Error('Unknown result code: ' + result.code);
      }
    } finally {
      setAskDisabled(false);
    }
  }

  function clearValues() {
    setTeamNumber('');
    setTeamNumberError(false);
    if (isTA) {
      setEmail('');
    }
    setQuestion('');
    setAssignmentId(null);
    setLocation('');

    if (queueData) {
      let new_locations = queueData.current_locations;
      if (new_locations.length === 0) {
        new_locations = DEFAULT_LOCATIONS;
      }
      if (new_locations.length === 1) {
        setLocation(new_locations[0]);
      }
      setLocations(new_locations);
    }

    if (currAssignments && currAssignments.length === 1) {
      setAssignmentId(currAssignments[0]._id);
    }
  }

  const teamNumberField = (
    <TextField
      required
      fullWidth
      variant="outlined"
      label="Team number"
      value={teamNumber}
      onChange={(event) => {
        // digits only, so the value is always a whole number (or empty)
        setTeamNumber(event.target.value.replace(/\D/g, ''));
        setTeamNumberError(false);
      }}
      error={teamNumberError}
      helperText={teamNumberError ? 'Team number must be 1 or more' : undefined}
      inputProps={{ inputMode: 'numeric', maxLength: 6 }}
    />
  );

  const locationField = (
    <FormControl required fullWidth variant="outlined">
      <InputLabel id="location-select-label">Location</InputLabel>
      <Select
        labelId="location-select-label"
        id="location-select"
        value={location ?? ''}
        label="Location"
        onChange={(e) => setLocation(e.target.value)}
      >
        {locations.map((loc) => (
          <MenuItem value={loc} key={loc}>
            {loc}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  const machineField = (
    <FormControl required fullWidth variant="outlined">
      <InputLabel id="topic-select-label">Machine</InputLabel>
      <Select
        labelId="topic-select-label"
        id="topic-select"
        value={assignmentId ?? ''}
        label="Machine"
        onChange={(e) => setAssignmentId(e.target.value as Id<'assignments'>)}
      >
        {currAssignments.length === 0 && (
          <MenuItem value="" disabled>
            No machines are open right now
          </MenuItem>
        )}
        {currAssignments.map((topic) => (
          <MenuItem value={topic._id} key={topic._id}>
            {topic.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box>
      <BaseCard>
        <Box sx={{ padding: '16px 20px 12px' }}>
          <Box component="h2" sx={t.cardTitle}>
            {isTA ? 'Add a print request for a team' : 'Submit a print request'}
          </Box>
        </Box>
        <Divider sx={{ mt: 1, mb: 3 }} />

        <CardContent sx={{ p: '0px 12px' }}>
          <Box component="form" onSubmit={handleSubmit}>
            {isTA ? (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                  {teamNumberField}
                  <TextField
                    required
                    fullWidth
                    variant="outlined"
                    type="email"
                    label="Email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    inputProps={{ maxLength: 256 }}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  {locationField}
                  {machineField}
                </Stack>
              </>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {teamNumberField}
                {locationField}
                {machineField}
              </Stack>
            )}
            <TextField
              required
              fullWidth
              multiline
              minRows={2}
              variant="outlined"
              label="Part (link or description)"
              placeholder="Onshape/Drive link to your STL/DXF, or describe the part (material, size, qty)"
              value={question ?? ''}
              onChange={(event) => setQuestion(event.target.value)}
              inputProps={{ maxLength: MAX_PART_LENGTH }}
              sx={{ mt: 2 }}
            />
            <OhqButton
              variant="primary"
              type="submit"
              fullWidth
              disabled={askDisabled}
              sx={{ mt: 3, py: 1.25 }}
            >
              Submit
            </OhqButton>
          </Box>
        </CardContent>
      </BaseCard>

      <CooldownViolationOverlay
        open={showCooldownOverlay}
        setOpen={setShowCooldownOverlay}
        timePassed={timePassed}
        email={email.trim()}
        teamNumber={parseTeamNumber(teamNumber)}
        question={question}
        location={location}
        assignmentId={assignmentId}
      />
    </Box>
  );
}
