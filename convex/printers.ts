import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, MutationCtx, query } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import {
  ensureAuthAndAdmin,
  ensureAuthAndTA,
  getAssignmentInCourse,
  getCurrentSemester,
} from './common';
import schema from './schema';

// Printers are set up by admins in Settings. printer-bridge/ (on the server,
// next to the backend) fetches the full list through the /printer_config HTTP
// route, watches each printer, and reports status through /printer_status.

const fields = schema.tables.printers.validator.fields;

// A printer in one of these states has a job, so it can't be marked in use,
// and reporting one clears the mark.
const ACTIVE_STATES: Doc<'printers'>['state'][] = ['preparing', 'printing', 'paused'];
// Matches the home page: status older than this is treated as offline.
const STALE_AFTER_MS = 3 * 60 * 1000;
// An in-use mark nobody started a job under expires after this. Keep in sync
// with IN_USE_EXPIRES_MS in src/components/home/shared/printerState.ts.
const IN_USE_EXPIRES_MS = 30 * 60 * 1000;
// How many finished jobs per printer to keep for the typical print length
// that wait estimates use.
const RECENT_JOBS_KEPT = 10;

// Admins can paste a URL or a bare host; keep just the host name or IP.
function normalizeHost(input: string) {
  const trimmed = input.trim();
  let host = '';
  try {
    host = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).hostname;
  } catch {
    // reported below
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new ConvexError('Enter the printer’s host name or IP address');
  }
  return host;
}

function normalizeSerial(input: string | undefined) {
  const serial = input?.trim().toUpperCase();
  if (!serial) {
    return undefined;
  }
  if (!/^[A-Z0-9]{8,20}$/.test(serial)) {
    throw new ConvexError('Serial numbers are 8 to 20 letters and digits');
  }
  return serial;
}

function normalizeAccessCode(input: string | undefined) {
  const code = input?.trim();
  if (!code) {
    return undefined;
  }
  if (code.length > 32 || /\s/.test(code)) {
    throw new ConvexError('Access codes are a single word of up to 32 characters');
  }
  return code;
}

function normalizeName(input: string) {
  const name = input.trim();
  if (name.length === 0 || name.length > 60) {
    throw new ConvexError('Printer names are 1 to 60 characters');
  }
  return name;
}

async function getPrinterInCourse(
  ctx: MutationCtx,
  courseId: Id<'courses'>,
  printerId: Id<'printers'>,
) {
  const printer = await ctx.db.get(printerId);
  if (!printer || printer.course_id !== courseId) {
    throw new ConvexError('Printer not found');
  }
  return printer;
}

/**
 * Printers for the admin settings table and CSV download, including access
 * codes (admins only).
 */
export const getPrinterSettings = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, args) => {
    await ensureAuthAndAdmin(ctx, args.courseId);
    const printers = await ctx.db
      .query('printers')
      .withIndex('by_course', (q) => q.eq('course_id', args.courseId))
      .collect();
    const lines = new Map<Id<'assignments'>, string>();
    for (const p of printers) {
      if (p.assignment_id && !lines.has(p.assignment_id)) {
        lines.set(p.assignment_id, (await ctx.db.get(p.assignment_id))?.name ?? '');
      }
    }
    return printers
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        _id: p._id,
        name: p.name,
        type: p.type,
        host: p.host,
        assignment_id: p.assignment_id,
        assignment_name: p.assignment_id ? lines.get(p.assignment_id) : undefined,
        serial: p.serial,
        access_code: p.access_code,
        state: p.state,
        status_updated_at: p.status_updated_at,
      }));
  },
});

type PrinterInput = {
  name: string;
  type: Doc<'printers'>['type'];
  host: string;
  serial?: string;
  access_code?: string;
};

/**
 * Validate a printer's settings from the form or a CSV row. A blank access
 * code keeps the current printer's code.
 */
function printerSettings(input: PrinterInput, current?: Doc<'printers'>) {
  const isBambu = input.type === 'bambu';
  const access_code = isBambu
    ? (normalizeAccessCode(input.access_code) ??
      (current?.type === 'bambu' ? current.access_code : undefined))
    : undefined;
  if (isBambu && !access_code) {
    throw new ConvexError('Bambu printers need their LAN access code');
  }
  return {
    name: normalizeName(input.name),
    type: input.type,
    host: normalizeHost(input.host),
    serial: isBambu ? normalizeSerial(input.serial) : undefined,
    access_code,
  };
}

// The queue line a printer serves: undefined keeps the current one (pages and
// CSVs from before queue lines don't send it), null clears it.
async function resolveQueueLine(
  ctx: MutationCtx,
  courseId: Id<'courses'>,
  assignment_id: Id<'assignments'> | null | undefined,
  current?: Doc<'printers'>,
) {
  if (assignment_id === undefined) {
    return current?.assignment_id;
  }
  if (assignment_id === null) {
    return undefined;
  }
  return (await getAssignmentInCourse(ctx, courseId, assignment_id))._id;
}

// Apply new settings to a printer. One at a new address or with new
// credentials hasn't reported yet, so its old status is cleared.
async function updatePrinterSettings(
  ctx: MutationCtx,
  printer: Doc<'printers'>,
  settings: ReturnType<typeof printerSettings> & { assignment_id?: Id<'assignments'> },
) {
  const reconnects =
    settings.type !== printer.type ||
    settings.host !== printer.host ||
    settings.serial !== printer.serial ||
    settings.access_code !== printer.access_code;
  await ctx.db.patch(printer._id, {
    ...settings,
    ...(reconnects
      ? { state: undefined, remaining_sec: undefined, status_updated_at: undefined }
      : {}),
  });
}

const printerArgs = {
  name: v.string(),
  type: fields.type,
  host: v.string(),
  serial: v.optional(v.string()),
  access_code: v.optional(v.string()),
  assignment_id: v.optional(v.union(v.id('assignments'), v.null())),
};

export const createPrinter = mutation({
  args: { courseId: v.id('courses'), ...printerArgs },
  returns: v.null(),
  handler: async (ctx, { courseId, assignment_id, ...input }) => {
    await ensureAuthAndAdmin(ctx, courseId);
    await ctx.db.insert('printers', {
      course_id: courseId,
      ...printerSettings(input),
      assignment_id: await resolveQueueLine(ctx, courseId, assignment_id),
    });
    return null;
  },
});

/**
 * Update a printer's settings. Leaving the access code blank keeps the
 * current one.
 */
export const updatePrinter = mutation({
  args: { courseId: v.id('courses'), printerId: v.id('printers'), ...printerArgs },
  returns: v.null(),
  handler: async (ctx, { courseId, printerId, assignment_id, ...input }) => {
    await ensureAuthAndAdmin(ctx, courseId);
    const printer = await getPrinterInCourse(ctx, courseId, printerId);
    await updatePrinterSettings(ctx, printer, {
      ...printerSettings(input, printer),
      assignment_id: await resolveQueueLine(ctx, courseId, assignment_id, printer),
    });
    return null;
  },
});

/**
 * Add or update printers from a CSV (parsed by the /upload_printers_csv route
 * in http.ts). Rows match existing printers by name. Nothing is saved unless
 * every row is valid.
 */
export const importPrinters = mutation({
  args: {
    courseId: v.id('courses'),
    rows: v.array(
      v.object({
        name: v.string(),
        type: v.string(),
        host: v.string(),
        serial: v.optional(v.string()),
        access_code: v.optional(v.string()),
        queue_line: v.optional(v.string()), // a machine's name; blank keeps the current line
      }),
    ),
  },
  returns: v.object({ created: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    await ensureAuthAndAdmin(ctx, args.courseId);
    if (args.rows.length === 0) {
      throw new ConvexError('The CSV has no printers in it');
    }

    const existing = await ctx.db
      .query('printers')
      .withIndex('by_course', (q) => q.eq('course_id', args.courseId))
      .collect();
    const existing_by_name = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
    const curr_sem = await getCurrentSemester(ctx, args.courseId);
    const machines = await ctx.db
      .query('assignments')
      .withIndex('by_sem_end', (q) => q.eq('semester_id', curr_sem._id))
      .collect();
    const machine_by_name = new Map(machines.map((m) => [m.name.trim().toLowerCase(), m._id]));

    const errors: string[] = [];
    const seen = new Set<string>();
    const planned: {
      current?: Doc<'printers'>;
      settings: ReturnType<typeof printerSettings> & { assignment_id?: Id<'assignments'> };
    }[] = [];
    args.rows.forEach((row, i) => {
      try {
        const type = row.type.trim().toLowerCase();
        if (!type.startsWith('bambu') && !type.startsWith('elegoo')) {
          throw new ConvexError('Type must be "bambu" or "elegoo"');
        }
        const name = normalizeName(row.name).toLowerCase();
        if (seen.has(name)) {
          throw new ConvexError(`"${row.name.trim()}" is listed more than once`);
        }
        seen.add(name);
        const current = existing_by_name.get(name);
        const line = row.queue_line?.trim().toLowerCase();
        if (line && !machine_by_name.has(line)) {
          throw new ConvexError(`No queue line named "${row.queue_line!.trim()}"`);
        }
        const input = { ...row, type: type.startsWith('bambu') ? 'bambu' : 'elegoo' } as const;
        planned.push({
          current,
          settings: {
            ...printerSettings(input, current),
            assignment_id: line ? machine_by_name.get(line) : current?.assignment_id,
          },
        });
      } catch (error) {
        // line 1 is the header
        const message = error instanceof ConvexError ? error.data : String(error);
        errors.push(`Line ${i + 2}: ${message}`);
      }
    });
    if (errors.length > 0) {
      throw new ConvexError(errors.join('\n'));
    }

    for (const { current, settings } of planned) {
      if (current) {
        await updatePrinterSettings(ctx, current, settings);
      } else {
        await ctx.db.insert('printers', { course_id: args.courseId, ...settings });
      }
    }
    const updated = planned.filter((p) => p.current).length;
    return { created: planned.length - updated, updated };
  },
});

export const deletePrinter = mutation({
  args: { courseId: v.id('courses'), printerId: v.id('printers') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAuthAndAdmin(ctx, args.courseId);
    const printer = await getPrinterInCourse(ctx, args.courseId, args.printerId);
    await ctx.db.delete(printer._id);
    return null;
  },
});

/**
 * Mark a printer in use when an officer sends a team to it, or unmark it. The
 * mark clears itself once the printer starts a job, or after 30 minutes
 * without one (see internalUpdatePrinterStatus; the home page hides expired
 * marks right away).
 */
export const setPrinterInUse = mutation({
  args: {
    courseId: v.id('courses'),
    printerId: v.id('printers'),
    in_use: v.boolean(),
    // Optional so pages loaded before teams could be attached still work.
    team_number: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAuthAndTA(ctx, args.courseId);
    const printer = await getPrinterInCourse(ctx, args.courseId, args.printerId);
    const reporting =
      printer.status_updated_at !== undefined &&
      Date.now() - printer.status_updated_at < STALE_AFTER_MS;
    if (args.in_use && reporting && ACTIVE_STATES.includes(printer.state)) {
      throw new ConvexError(`${printer.name} is already printing`);
    }
    if (
      args.team_number !== undefined &&
      (!Number.isSafeInteger(args.team_number) || args.team_number < 1)
    ) {
      throw new ConvexError('Team number must be a whole number of 1 or more');
    }
    await ctx.db.patch(printer._id, {
      in_use_since: args.in_use ? Date.now() : undefined,
      in_use_team: args.in_use ? args.team_number : undefined,
    });
    return null;
  },
});

/**
 * Each printer's state, time left, and whether an officer marked it in use,
 * for the home page.
 */
export const getPrinterStatus = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, args) => {
    const printers = await ctx.db
      .query('printers')
      .withIndex('by_course', (q) => q.eq('course_id', args.courseId))
      .collect();
    return printers
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        _id: p._id,
        name: p.name,
        state: p.state ?? 'offline',
        remaining_sec: p.remaining_sec,
        updated_at: p.status_updated_at ?? 0,
        in_use_since: p.in_use_since,
        in_use_team: p.in_use_team,
        // for wait estimates (src/components/home/shared/printerState.ts)
        assignment_id: p.assignment_id,
        job_sec: p.job_sec,
        recent_job_secs: p.recent_job_secs,
      }));
  },
});

/**
 * Every printer, with access codes, for the bridge. Only reachable through the
 * /printer_config HTTP route, which checks the bridge's secret.
 */
export const internalGetBridgeConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    const printers = await ctx.db.query('printers').collect();
    return printers.map((p) => ({
      id: p._id,
      name: p.name,
      type: p.type,
      host: p.host,
      serial: p.serial,
      access_code: p.access_code,
    }));
  },
});

/**
 * Status reported by the bridge. Printers deleted since the bridge last
 * fetched its config are skipped.
 */
export const internalUpdatePrinterStatus = internalMutation({
  args: {
    printers: v.array(
      v.object({
        id: v.id('printers'),
        state: v.union(...fields.state.members),
        remaining_sec: fields.remaining_sec,
        // total length of the running job; bridges from before this don't send it
        job_sec: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const report of args.printers) {
      const printer = await ctx.db.get(report.id);
      if (!printer) {
        continue;
      }
      const hasJob = ACTIVE_STATES.includes(report.state);
      // A job ended (finished, cancelled or failed): keep its length for the
      // typical print length. Offline isn't an end; the job may still be running.
      const jobEnded =
        !hasJob &&
        report.state !== 'offline' &&
        ACTIVE_STATES.includes(printer.state) &&
        printer.job_sec !== undefined;
      // set every field so a time the printer stopped reporting is cleared
      await ctx.db.patch(printer._id, {
        state: report.state,
        remaining_sec: report.remaining_sec,
        status_updated_at: now,
        job_sec: hasJob
          ? (report.job_sec ?? printer.job_sec)
          : report.state === 'offline'
            ? printer.job_sec
            : undefined,
        ...(jobEnded
          ? {
              recent_job_secs: [...(printer.recent_job_secs ?? []), printer.job_sec!].slice(
                -RECENT_JOBS_KEPT,
              ),
            }
          : {}),
        // the team the printer was marked for has started its job, or the
        // mark expired without one
        ...(hasJob ||
        (printer.in_use_since !== undefined && now - printer.in_use_since > IN_USE_EXPIRES_MS)
          ? { in_use_since: undefined, in_use_team: undefined }
          : {}),
      });
    }
    return null;
  },
});
