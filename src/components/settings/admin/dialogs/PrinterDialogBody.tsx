import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';

export const PRINTER_TYPES = {
  bambu: 'Bambu Lab (X1, H2, P1, A1)',
  elegoo: 'Elegoo Centauri Carbon',
} as const;

export type PrinterType = keyof typeof PRINTER_TYPES;

export default function PrinterDialogBody(props: {
  name: string;
  setName: (v: string) => void;
  type: PrinterType;
  setType: (v: PrinterType) => void;
  host: string;
  setHost: (v: string) => void;
  accessCode: string;
  setAccessCode: (v: string) => void;
  serial: string;
  setSerial: (v: string) => void;
  // machine id, or '' for none
  queueLine: string;
  setQueueLine: (v: string) => void;
  machines: { _id: string; name: string }[];
  hidden: boolean;
  setHidden: (v: boolean) => void;
}) {
  const {
    name,
    setName,
    type,
    setType,
    host,
    setHost,
    accessCode,
    setAccessCode,
    serial,
    setSerial,
    queueLine,
    setQueueLine,
    machines,
    hidden,
    setHidden,
  } = props;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Name"
          placeholder="e.g. Mei"
          variant="standard"
          required
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 60 }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl variant="standard" required fullWidth>
          <InputLabel id="printer-type-label">Type</InputLabel>
          <Select
            labelId="printer-type-label"
            value={type}
            onChange={(e) => setType(e.target.value as PrinterType)}
          >
            {Object.entries(PRINTER_TYPES).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl variant="standard" fullWidth>
          <InputLabel id="printer-line-label">Queue line</InputLabel>
          <Select
            labelId="printer-line-label"
            value={queueLine}
            onChange={(e) => setQueueLine(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {machines.map((m) => (
              <MenuItem key={m._id} value={m._id}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Wait estimates for this line use the printer</FormHelperText>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Host name, IP address or URL"
          placeholder="e.g. rc-bambu-mei.wifi.local.cmu.edu"
          variant="standard"
          required
          fullWidth
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={<Checkbox checked={hidden} onChange={(e) => setHidden(e.target.checked)} />}
          label="Hide on the queue page"
        />
        <FormHelperText sx={{ mt: -0.5 }}>
          Still watched, and still used for its queue line's wait estimates.
        </FormHelperText>
      </Grid>
      {type === 'bambu' && (
        <>
          <Grid item xs={12} sm={6}>
            <TextField
              label="LAN access code"
              variant="standard"
              required
              fullWidth
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              helperText="In the printer's network settings, next to LAN Only"
              inputProps={{ maxLength: 32, autoComplete: 'off' }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Serial number (optional)"
              variant="standard"
              fullWidth
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              helperText="Read from the printer if blank"
              inputProps={{ maxLength: 20 }}
            />
          </Grid>
        </>
      )}
    </Grid>
  );
}
