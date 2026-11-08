import { useState } from 'react';
import { Stack, TableCell, TableRow, Typography, useTheme } from '@mui/material';

import PrinterDialogBody, { PrinterType } from './dialogs/PrinterDialogBody';

import AddDialog from '../../common/dialogs/AddDialog';
import EditDialog from '../../common/dialogs/EditDialog';
import DeleteDialog from '../../common/dialogs/DeleteDialog';
import UploadDialog from '../../common/dialogs/UploadDialog';
import OhqButton from '../../common/buttons/OhqButton';

import CollapsedTable from '../../common/table/CollapsedTable';
import EditDeleteRow from '../../common/table/EditDeleteRow';

import download from 'downloadjs';
import { useQuery, useMutation } from 'convex/react';
import { useAuthToken } from '@convex-dev/auth/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useCourseId } from '../../../contexts/CourseContext';
import { showErrorToast, showToast } from '../../../services/ToastService';

const TYPE_LABELS: Record<PrinterType, string> = { bambu: 'Bambu Lab', elegoo: 'Elegoo' };

// Same cutoff the home page uses to show a printer as Offline.
const STALE_AFTER_MS = 3 * 60 * 1000;

// Printers whose status shows on the home page. printer-bridge/ on the server
// picks up changes here within 30 seconds.
export default function PrinterSettings() {
  const courseId = useCourseId();
  const printers = useQuery(api.printers.getPrinterSettings, { courseId }) ?? [];
  // Queue lines a printer can serve: the semester's machines, minus the legacy "Other".
  const machineData = useQuery(api.home.home_get.getAllAssignments, { courseId });
  const machines = (machineData?.all_assignments ?? []).filter(
    (m) => m._id !== machineData?.other_assignment_id,
  );

  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedId, setSelectedId] = useState<Id<'printers'> | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<PrinterType>('bambu');
  const [host, setHost] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [serial, setSerial] = useState('');
  const [queueLine, setQueueLine] = useState('');

  const selected = printers.find((p) => p._id === selectedId);

  const handleAddDialog = () => {
    setName('');
    setType('bambu');
    setHost('');
    setAccessCode('');
    setSerial('');
    setQueueLine(machines.length === 1 ? machines[0]._id : '');
    setOpenAdd(true);
  };

  const handleEditDialog = (printer: (typeof printers)[number]) => {
    setSelectedId(printer._id);
    setName(printer.name);
    setType(printer.type);
    setHost(printer.host);
    setAccessCode(printer.access_code ?? '');
    setSerial(printer.serial ?? '');
    setQueueLine(printer.assignment_id ?? '');
    setOpenEdit(true);
  };

  const handleDeleteDialog = (printer: (typeof printers)[number]) => {
    setSelectedId(printer._id);
    setOpenDelete(true);
  };

  const handleClose = () => {
    setOpenAdd(false);
    setOpenEdit(false);
    setOpenDelete(false);
    setOpenUpload(false);
  };

  // CSV import and export go through HTTP routes in convex/http.ts.
  const theme = useTheme();
  const token = useAuthToken();
  const csvUrl = (route: string) =>
    `${import.meta.env.VITE_APP_CONVEX_SITE_URL}/${route}?courseId=${courseId}`;

  const handleDownload = async () => {
    const response = await fetch(csvUrl('download_printers_csv'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      showErrorToast(await response.text());
      return;
    }
    download(await response.blob(), 'printers.csv', 'text/csv');
  };

  const handleUploadDialog = () => {
    setFile(null);
    setFileName('');
    setOpenUpload(true);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    const response = await fetch(csvUrl('upload_printers_csv'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: file,
    });
    if (!response.ok) {
      // every problem in the CSV, one per line; nothing was saved
      showErrorToast(<span style={{ whiteSpace: 'pre-line' }}>{await response.text()}</span>);
      return;
    }
    const { created, updated } = await response.json();
    showToast(`Printers imported: ${created} added, ${updated} updated`);
    handleClose();
  };

  const fields = () => ({
    courseId,
    name,
    type,
    host,
    serial: type === 'bambu' ? serial : undefined,
    access_code: type === 'bambu' && accessCode !== '' ? accessCode : undefined,
    assignment_id: queueLine === '' ? null : (queueLine as Id<'assignments'>),
  });

  const createPrinterMutation = useMutation(api.printers.createPrinter);
  const handleAdd = async (event) => {
    event.preventDefault();
    await createPrinterMutation(fields()).then(handleClose);
  };

  const updatePrinterMutation = useMutation(api.printers.updatePrinter);
  const handleEdit = async (event) => {
    event.preventDefault();
    await updatePrinterMutation({ ...fields(), printerId: selectedId! }).then(handleClose);
  };

  const deletePrinterMutation = useMutation(api.printers.deletePrinter);
  const handleDelete = async () => {
    await deletePrinterMutation({ courseId, printerId: selectedId! }).then(handleClose);
  };

  const dialogBody = (
    <PrinterDialogBody
      name={name}
      setName={setName}
      type={type}
      setType={setType}
      host={host}
      setHost={setHost}
      accessCode={accessCode}
      setAccessCode={setAccessCode}
      serial={serial}
      setSerial={setSerial}
      queueLine={queueLine}
      setQueueLine={setQueueLine}
      machines={machines}
    />
  );

  return (
    <div>
      <CollapsedTable title="Printer Settings">
        {printers.map((printer, index) => {
          const reporting =
            printer.status_updated_at !== undefined &&
            Date.now() - printer.status_updated_at < STALE_AFTER_MS &&
            printer.state !== 'offline';
          return (
            <EditDeleteRow
              key={printer._id}
              index={index}
              row={printer}
              rowKey={printer._id}
              handleEdit={handleEditDialog}
              handleDelete={handleDeleteDialog}
            >
              <TableCell component="th" scope="row" sx={{ pl: 3.25 }}>
                <Typography sx={{ fontWeight: 'bold' }}>{printer.name}</Typography>
                <Typography sx={{ fontSize: 13, color: 'ink.secondary' }}>
                  {TYPE_LABELS[printer.type]}
                  {printer.assignment_name ? ` · ${printer.assignment_name}` : ' · no queue line'}
                </Typography>
              </TableCell>
              <TableCell align="left" sx={{ wordBreak: 'break-word' }}>
                <Typography sx={{ fontStyle: 'italic' }}>{printer.host}</Typography>
                {printer.type === 'bambu' &&
                  (printer.access_code ? (
                    <Typography
                      sx={{ fontSize: 13, color: 'ink.secondary', fontFamily: 'monospace' }}
                    >
                      Access code: {printer.access_code}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: 13, color: 'error.main' }}>
                      No access code set
                    </Typography>
                  ))}
              </TableCell>
              <TableCell align="left">
                <Typography sx={{ fontSize: 13, color: reporting ? 'forest.main' : 'ink.muted' }}>
                  {reporting ? `Reporting (${printer.state})` : 'Not reporting'}
                </Typography>
              </TableCell>
            </EditDeleteRow>
          );
        })}
        <TableRow style={{ background: theme.palette.background.default }}>
          <TableCell align="center" colSpan={5}>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
              <OhqButton variant="primary" onClick={handleAddDialog}>
                + Add Printer
              </OhqButton>
              <OhqButton variant="ghost" onClick={handleDownload}>
                Download CSV
              </OhqButton>
              <OhqButton variant="ghost" onClick={handleUploadDialog}>
                Upload CSV
              </OhqButton>
            </Stack>
          </TableCell>
        </TableRow>
      </CollapsedTable>

      <AddDialog
        isOpen={openAdd}
        onClose={handleClose}
        handleCreate={handleAdd}
        title="Add Printer"
      >
        {dialogBody}
      </AddDialog>

      <EditDialog
        isOpen={openEdit}
        onClose={handleClose}
        handleEdit={handleEdit}
        title="Edit Printer"
      >
        {dialogBody}
      </EditDialog>

      <UploadDialog
        isOpen={openUpload}
        onClose={handleClose}
        handleUpload={handleUpload}
        file={file}
        setFile={setFile}
        fileName={fileName}
        setFileName={setFileName}
      />

      <DeleteDialog
        title="Delete Printer"
        isOpen={openDelete}
        onClose={handleClose}
        handleDelete={handleDelete}
        itemName={selected?.name ?? 'this printer'}
      />
    </div>
  );
}
