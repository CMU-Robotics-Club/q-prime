import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, MutationCtx, query } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import { ensureAuthAndAdmin } from './common';
import schema from './schema';

// Printers are set up by admins in Settings. printer-bridge/ (on the server,
// next to the backend) fetches the full list through the /printer_config HTTP
// route, watches each printer, and reports status through /printer_status.

const fields = schema.tables.printers.validator.fields;

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
    return printers
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        _id: p._id,
        name: p.name,
        type: p.type,
        host: p.host,
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

// Apply new settings to a printer. One at a new address or with new
// credentials hasn't reported yet, so its old status is cleared.
async function updatePrinterSettings(
  ctx: MutationCtx,
  printer: Doc<'printers'>,
  settings: ReturnType<typeof printerSettings>,
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
};

export const createPrinter = mutation({
  args: { courseId: v.id('courses'), ...printerArgs },
  returns: v.null(),
  handler: async (ctx, { courseId, ...input }) => {
    await ensureAuthAndAdmin(ctx, courseId);
    await ctx.db.insert('printers', { course_id: courseId, ...printerSettings(input) });
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
  handler: async (ctx, { courseId, printerId, ...input }) => {
    await ensureAuthAndAdmin(ctx, courseId);
    const printer = await getPrinterInCourse(ctx, courseId, printerId);
    await updatePrinterSettings(ctx, printer, printerSettings(input, printer));
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

    const errors: string[] = [];
    const seen = new Set<string>();
    const planned: { current?: Doc<'printers'>; settings: ReturnType<typeof printerSettings> }[] =
      [];
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
        const input = { ...row, type: type.startsWith('bambu') ? 'bambu' : 'elegoo' } as const;
        planned.push({ current, settings: printerSettings(input, current) });
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
 * Each printer's state and time left, for the home page.
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
      // set every field so a time the printer stopped reporting is cleared
      await ctx.db.patch(printer._id, {
        state: report.state,
        remaining_sec: report.remaining_sec,
        status_updated_at: now,
      });
    }
    return null;
  },
});
