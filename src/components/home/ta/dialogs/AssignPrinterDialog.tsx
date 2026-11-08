import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import DialogShell from '../../../common/dialogs/DialogShell';
import {
  describePrinter,
  PrinterStatusRow,
  STATE_COLORS,
  STATE_LABELS,
  useNow,
} from '../../shared/printerState';
import { Id } from '../../../../../convex/_generated/dataModel';
import { t, s } from '../../../../themes/styles';

// Shown when an officer marks a called team done: pick the free printer the
// team is going to (it's marked in use for them), or finish without one.
export default function AssignPrinterDialog(props: {
  open: boolean;
  teamLabel: string;
  printers: PrinterStatusRow[];
  onAssign: (printerId: Id<'printers'>) => void;
  onDoneWithoutPrinter: () => void;
  onClose: () => void;
}) {
  const { open, teamLabel, printers, onAssign, onDoneWithoutPrinter, onClose } = props;
  const now = useNow();

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`${teamLabel} is done`}
      subtitle="Which printer are they using?"
      primaryAction={{
        label: 'Done without a printer',
        variant: 'ghost',
        onClick: onDoneWithoutPrinter,
      }}
      secondaryAction={{ label: 'Cancel', onClick: onClose }}
    >
      <Stack spacing={1}>
        {printers.map((printer) => {
          const view = describePrinter(printer, now);
          return (
            <ButtonBase
              key={printer._id}
              disabled={!view.isFree}
              onClick={() => onAssign(printer._id)}
              sx={[
                s.hairlineBox,
                {
                  display: 'block',
                  textAlign: 'left',
                  width: '100%',
                  '&:hover, &:focus-visible': { borderColor: 'forest.main' },
                  '&.Mui-disabled': { opacity: 0.55 },
                },
              ]}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="baseline"
                spacing={1}
              >
                <Typography sx={t.studentName}>{printer.name}</Typography>
                <Box sx={[t.monoTag, { color: STATE_COLORS[view.displayState] }]}>
                  {STATE_LABELS[view.displayState]}
                </Box>
              </Stack>
              {view.detail && (
                <Typography sx={[t.bodySmall, { mt: 0.25 }]}>{view.detail}</Typography>
              )}
            </ButtonBase>
          );
        })}
      </Stack>
    </DialogShell>
  );
}
