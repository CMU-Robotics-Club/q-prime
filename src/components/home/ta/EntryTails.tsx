import { useState } from 'react';
import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';
import { Chat, Delete } from '@mui/icons-material';

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc } from '../../../../convex/_generated/dataModel';
import { useCourseId } from '../../../contexts/CourseContext';

import OhqButton from '../../common/buttons/OhqButton';
import HelpTimer from '../../common/timer/HelpTimer';
import OverflowMenu, { OverflowMenuItem } from '../../common/menus/OverflowMenu';
import DialogShell from '../../common/dialogs/DialogShell';
import MessageDialog from './dialogs/MessageDialog';
import AssignPrinterDialog from './dialogs/AssignPrinterDialog';
import { t } from '../../../themes/styles';

export default function EntryTails(props) {
  const {
    index,
    tempDisabled,
    currentTime,
    showCooldownApproval,
    handleClickHelp,
    handleCancel,
    removeStudent,
    handleClickUnfreeze,
    approveCooldownOverride,
  } = props;
  const student: Doc<'ohq'> = props['student'];
  const courseId = useCourseId();
  const userData = useQuery(api.home.home_get.getUserData, { courseId });
  const queueData = useQuery(api.home.home_get.getQueueData, { courseId });

  const [openMessage, setOpenMessage] = useState(false);
  const [openRemoveConfirm, setOpenRemoveConfirm] = useState(false);
  const [openAssignPrinter, setOpenAssignPrinter] = useState(false);

  // With printers set up, Done asks which printer the team is going to.
  const printers = useQuery(api.printers.getPrinterStatus, { courseId }) ?? [];
  const setPrinterInUse = useMutation(api.printers.setPrinterInUse);
  const teamLabel =
    student.team_number !== undefined ? `Team ${student.team_number}` : student.student_name;
  const handleDone = () => {
    if (printers.length > 0) {
      setOpenAssignPrinter(true);
    } else {
      removeStudent(index, true);
    }
  };
  const handleAssignPrinter = async (printerId) => {
    // Mark the printer first: if someone just took it, the team stays called
    // and the officer can pick another.
    await setPrinterInUse({ courseId, printerId, in_use: true, team_number: student.team_number });
    setOpenAssignPrinter(false);
    await removeStudent(index, true);
  };

  const status = student.status;
  const isOwnHelp =
    status === 'being_helped' && student.helping_ta?.ta_id === userData?.ta_data?.ta_id;

  const showSelfTimer = isOwnHelp && userData?.ta_data?.show_self_timer;
  const showOthersTimer =
    !isOwnHelp &&
    status === 'being_helped' &&
    userData?.ta_data?.show_others_timer &&
    queueData?.allow_tas_show_others_timer;
  const elapsedMs = student.help_start_time_ms ? currentTime - student.help_start_time_ms : 0;

  const overflowItems: OverflowMenuItem[] = [];

  if (status === 'waiting' || status === 'fixing_question') {
    overflowItems.push({
      icon: <Chat fontSize="small" />,
      label: 'Message',
      onClick: () => setOpenMessage(true),
    });
  }
  if (status !== 'being_helped' || isOwnHelp) {
    overflowItems.push({
      icon: <Delete fontSize="small" />,
      label: 'Remove',
      onClick: () => setOpenRemoveConfirm(true),
      variant: 'danger',
    });
  }

  let actionElement: ReactNode = null;
  switch (status) {
    case 'being_helped':
      if (isOwnHelp) {
        actionElement = (
          <>
            {showSelfTimer && <HelpTimer elapsedMs={elapsedMs} />}
            <OhqButton variant="ghost" disabled={tempDisabled} onClick={() => handleCancel(index)}>
              Cancel
            </OhqButton>
            <OhqButton variant="primary" disabled={tempDisabled} onClick={handleDone}>
              Done
            </OhqButton>
          </>
        );
      } else if (showOthersTimer) {
        actionElement = <HelpTimer elapsedMs={elapsedMs} helpingTa={student.helping_ta!} />;
      } else {
        actionElement = (
          <>
            <Typography variant="body2" color="text.secondary">
              Called by {student.helping_ta?.preferred_name}
            </Typography>
          </>
        );
      }
      break;
    case 'frozen':
      actionElement = (
        <OhqButton variant="warning" onClick={() => handleClickUnfreeze(index)}>
          Unfreeze
        </OhqButton>
      );
      break;
    case 'cooldown_violation':
      actionElement = (
        <OhqButton
          variant="primary"
          disabled={tempDisabled}
          onClick={() =>
            showCooldownApproval ? approveCooldownOverride() : handleClickHelp(index)
          }
        >
          {showCooldownApproval ? 'Approve' : 'Call'}
        </OhqButton>
      );
      break;
    case 'waiting':
    default:
      actionElement = (
        <OhqButton variant="primary" disabled={tempDisabled} onClick={() => handleClickHelp(index)}>
          Call
        </OhqButton>
      );
      break;
  }

  return (
    <Stack
      direction="column"
      alignItems="flex-end"
      spacing={0.5}
      sx={{ mr: { xs: 0, sm: 1 }, my: 1 }}
    >
      <Stack direction="row" alignItems="center" spacing={0.75}>
        {actionElement}
        {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}
      </Stack>
      <MessageDialog isOpen={openMessage} onClose={() => setOpenMessage(false)} student={student} />
      <AssignPrinterDialog
        open={openAssignPrinter}
        teamLabel={teamLabel}
        printers={printers}
        onAssign={handleAssignPrinter}
        onDoneWithoutPrinter={() => {
          setOpenAssignPrinter(false);
          removeStudent(index, true);
        }}
        onClose={() => setOpenAssignPrinter(false)}
      />
      <DialogShell
        open={openRemoveConfirm}
        onClose={() => setOpenRemoveConfirm(false)}
        title="Remove this team?"
        primaryAction={{
          label: 'Remove',
          variant: 'danger',
          onClick: () => {
            setOpenRemoveConfirm(false);
            removeStudent(index, false);
          },
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setOpenRemoveConfirm(false) }}
      >
        <Typography sx={t.bodyMuted}>
          <strong>{student.student_name}</strong> will be taken off the queue and notified.
        </Typography>
      </DialogShell>
    </Stack>
  );
}
