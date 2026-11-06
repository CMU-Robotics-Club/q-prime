import { Grid, TextField } from '@mui/material';

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

export default function TopicDialogBody(props) {
  const { name, setName, startDate, setStartDate, endDate, setEndDate } = props;

  return (
    <Grid container spacing={3}>
      <Grid className="d-flex" item xs={12}>
        <TextField
          label="Machine Name"
          placeholder="e.g. 3D Printer"
          variant="standard"
          required
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Grid>
      <Grid className="d-flex" item xs={6}>
        <DateTimePicker
          renderInput={(props) => <TextField {...props} variant="standard" required fullWidth />}
          label="Start Date"
          value={startDate}
          onChange={(newValue) => setStartDate(newValue)}
        />
      </Grid>
      <Grid className="d-flex" item xs={6}>
        <DateTimePicker
          renderInput={(props) => <TextField {...props} variant="standard" required fullWidth />}
          label="End Date"
          value={endDate}
          onChange={(newValue) => setEndDate(newValue)}
          minDate={startDate}
        />
      </Grid>
    </Grid>
  );
}
