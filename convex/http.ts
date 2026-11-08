import { FunctionArgs, httpRouter } from 'convex/server';
import { ConvexError } from 'convex/values';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import { auth } from './auth';
import { getAuthUserId } from '@convex-dev/auth/server';
import { DateTime } from 'luxon';
import { Id } from './_generated/dataModel';
import { HEX_COLOR } from './common';

const http = httpRouter();

// API prefix for HTTP routes (default: '/api')
// Set via: npx convex env set HTTP_API_PREFIX /api
// For local dev without nginx, set to empty string: npx convex env set HTTP_API_PREFIX ""
const API_PREFIX = process.env.HTTP_API_PREFIX ?? '/api';

auth.addHttpRoutes(http);

/**
 * Helper function to create CORS headers.
 */
function createCorsHeaders(additionalHeaders: Record<string, string> = {}) {
  const origin = process.env.SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
    // Let the frontend read the CSV download filename cross-origin.
    'Access-Control-Expose-Headers': 'Content-Disposition',
    ...additionalHeaders,
  };
}

/**
 * Helper function to handle preflight requests.
 */
function handlePreflight() {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}

/**
 * Multi-tenant: every CSV route requires ?courseId=<id> in the request URL.
 */
function getCourseIdFromRequest(request: Request): Id<'courses'> {
  const url = new URL(request.url);
  const courseId = url.searchParams.get('courseId');
  if (!courseId) {
    throw new Error('Missing courseId query parameter');
  }
  return courseId as Id<'courses'>;
}

// OPTIONS handler for download_assignment_csv
http.route({
  path: `${API_PREFIX}/download_assignment_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/download_assignment_csv`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTA, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer');
    }

    // Machines template. Uploads still accept an optional assignment_type column.
    const csvContent = [
      'name,start_date,end_date',
      '3D Printer,11/7/26 9:00 AM,11/8/26 6:00 PM',
      'Laser Cutter,11/7/26 9:00 AM,11/8/26 6:00 PM',
    ].join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: createCorsHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="machines_example.csv"`,
      }),
    });
  }),
});

// OPTIONS handler for download_tas_csv
http.route({
  path: `${API_PREFIX}/download_tas_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/download_tas_csv`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTAOrOwner, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer or owner');
    }

    const csvRows = ['name,email,is_admin', 'Example Officer,officer@andrew.cmu.edu,false'];
    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: createCorsHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="officers_example.csv"`,
      }),
    });
  }),
});

// OPTIONS handler for download_access_control_csv
http.route({
  path: `${API_PREFIX}/download_access_control_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/download_access_control_csv`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTA, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer');
    }

    const csvContent = [
      'email,is_whitelisted,is_blacklisted',
      'example@andrew.cmu.edu,false,false',
    ].join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: createCorsHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="access_control_template.csv"`,
      }),
    });
  }),
});

// OPTIONS handler for download_questions_csv
http.route({
  path: `${API_PREFIX}/download_questions_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/download_questions_csv`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    const { semesterName, rows } = await ctx.runQuery(
      internal.metrics.internalGetQuestionsCsvDump,
      { user_id: user, courseId },
    );

    // The dump above checks admin access, so this second read is safe.
    const teamInfo = new Map(
      (await ctx.runQuery(internal.common.internalGetQuestionTeamInfo, { courseId })).map((q) => [
        q.question_id,
        q,
      ]),
    );

    const headers = [
      'question_id',
      'semester_id',
      'semester_name',
      'assignment_id',
      'assignment_name',
      'team_number',
      'phone_number',
      'student_id',
      'student_name',
      'student_email',
      'ta_id',
      'ta_name',
      'ta_email',
      'question',
      'location',
      'created_by',
      'finished_by',
      'entry_time_ms',
      'entry_time_iso',
      'exit_time_ms',
      'exit_time_iso',
      'help_duration_ms',
      'num_asked_to_fix',
    ] as const;

    const escapeCell = (val: unknown): string => {
      const s = val == null ? '' : String(val);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines: string[] = [headers.join(',')];
    for (const row of rows) {
      const info = teamInfo.get(row.question_id);
      const cells = { ...row, team_number: info?.team_number, phone_number: info?.phone_number };
      lines.push(headers.map((h) => escapeCell(cells[h])).join(','));
    }
    const csvContent = lines.join('\r\n');

    const safeSemName = semesterName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'semester';
    const filename = `print_requests_${safeSemName}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: createCorsHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      }),
    });
  }),
});

// OPTIONS handler for upload_assignment_csv
http.route({
  path: `${API_PREFIX}/upload_assignment_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/upload_assignment_csv`,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTA, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer');
    }

    const blob = await request.blob();
    const csvData = await blob.text();

    const csvRows = await ctx.runAction(internal.actions.parseCsvNode, {
      csvText: csvData,
    });

    const globalSettings = await ctx.runQuery(internal.common.internalGetGlobalSettings, {
      courseId,
    });
    const timezone = globalSettings.timezone;

    for (const assignment of csvRows) {
      const name = assignment.name;
      const assignment_type = assignment.assignment_type;

      // Try to parse with the example csv format first, then ISO, then JS
      let startDt = DateTime.fromFormat(assignment.start_date, 'M/d/yy h:mm a', { zone: timezone });
      if (!startDt.isValid) {
        startDt = DateTime.fromISO(assignment.start_date, { zone: timezone });
      }
      // Fallback to JS Date parsing if both fail, assuming local/UTC as before but wrapped in DateTime
      if (!startDt.isValid) {
        startDt = DateTime.fromJSDate(new Date(assignment.start_date)).setZone(timezone, {
          keepLocalTime: true,
        });
      }

      let endDt = DateTime.fromFormat(assignment.end_date, 'M/d/yy h:mm a', {
        zone: timezone,
      });
      if (!endDt.isValid) {
        endDt = DateTime.fromISO(assignment.end_date, { zone: timezone });
      }
      if (!endDt.isValid) {
        endDt = DateTime.fromJSDate(new Date(assignment.end_date)).setZone(timezone, {
          keepLocalTime: true,
        });
      }

      await ctx.runMutation(api.settings.settings_mutate.createAssignment, {
        courseId,
        name: name,
        assignment_type: assignment_type,
        start_date_ms: startDt.toMillis(),
        end_date_ms: endDt.toMillis(),
      });
    }

    return new Response(null, {
      status: 200,
      headers: createCorsHeaders(),
    });
  }),
});

// OPTIONS handler for upload_tas_csv
http.route({
  path: `${API_PREFIX}/upload_tas_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/upload_tas_csv`,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTAOrOwner, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer or owner');
    }

    const blob = await request.blob();
    const csvData = await blob.text();

    const csvRows = await ctx.runAction(internal.actions.parseCsvNode, {
      csvText: csvData,
    });

    for (const ta of csvRows) {
      const name = ta.name;
      const email = ta.email;
      const is_admin = ta.is_admin.toLowerCase() === 'true';

      await ctx.runMutation(api.settings.settings_mutate.createTA, {
        courseId,
        name: name,
        email: email,
        isAdmin: is_admin,
      });
    }

    return new Response(null, {
      status: 200,
      headers: createCorsHeaders(),
    });
  }),
});

// OPTIONS handler for upload_access_control_csv
http.route({
  path: `${API_PREFIX}/upload_access_control_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: `${API_PREFIX}/upload_access_control_csv`,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const user = await getAuthUserId(ctx);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const courseId = getCourseIdFromRequest(request);

    // ensure user is a TA
    const is_ta = await ctx.runQuery(internal.common.internalEnsureTA, {
      user_id: user,
      courseId,
    });

    if (!is_ta) {
      throw new Error('User is not an officer');
    }

    const blob = await request.blob();
    const csvData = await blob.text();

    const csvRows = await ctx.runAction(internal.actions.parseCsvNode, {
      csvText: csvData,
    });

    for (const acl_entry of csvRows) {
      const email = acl_entry.email;
      const is_whitelisted = acl_entry.is_whitelisted.toLowerCase() === 'true';
      const is_blacklisted = acl_entry.is_blacklisted.toLowerCase() === 'true';

      if (is_whitelisted && is_blacklisted) {
      }

      await ctx.runMutation(api.settings.settings_mutate.updateAccessControlledUser, {
        courseId,
        email: email,
        is_whitelisted: is_whitelisted,
        is_blacklisted: is_blacklisted,
      });
    }

    return new Response(null, {
      status: 200,
      headers: createCorsHeaders(),
    });
  }),
});

/**
 * Per-course theme CSS. Returns a single :root rule with the course's
 * configured primary + secondary colors (or the defaults if unset).
 *
 * Mounted at /_theme/<slug>.css. The `index.html` bootstrap synchronously
 * injects a <link rel="stylesheet"> pointing here whenever a slug is
 * present in the URL — that link is render-blocking by default, so the
 * browser delays first paint until the colors arrive. No FOUC even on a
 * first-ever visit.
 */
const DEFAULT_PRIMARY = '#14532D';
const DEFAULT_SECONDARY = '#EAB308';

http.route({
  pathPrefix: '/_theme/',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const filename = url.pathname.replace(/^\/_theme\//, '');
    const slug = filename.replace(/\.css$/, '');

    let primary = DEFAULT_PRIMARY;
    let secondary = DEFAULT_SECONDARY;

    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      const course = await ctx.runQuery(api.courses.getCourseBySlug, { slug });
      if (course) {
        const settings = await ctx.runQuery(internal.common.internalGetGlobalSettings, {
          courseId: course._id,
        });
        if (settings.theme_primary && HEX_COLOR.test(settings.theme_primary)) {
          primary = settings.theme_primary;
        }
        if (settings.theme_secondary && HEX_COLOR.test(settings.theme_secondary)) {
          secondary = settings.theme_secondary;
        }
      }
    }

    const css = `:root{--ohq-course-primary:${primary};--ohq-course-secondary:${secondary};}\n`;

    return new Response(css, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        // Short cache so admin color changes propagate within a minute.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }),
});

const PRINTER_CSV_COLUMNS = ['name', 'type', 'host', 'access_code', 'serial'] as const;

function csvCell(value: unknown) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

http.route({
  path: `${API_PREFIX}/download_printers_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

// The course's printers, with access codes, as a CSV to edit and upload again.
http.route({
  path: `${API_PREFIX}/download_printers_csv`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const courseId = getCourseIdFromRequest(request);
    let printers;
    try {
      // checks that the caller is an admin
      printers = await ctx.runQuery(api.printers.getPrinterSettings, { courseId });
    } catch {
      return new Response('Only admins can download printers', {
        status: 403,
        headers: createCorsHeaders(),
      });
    }

    const rows =
      printers.length > 0
        ? printers.map((p) => [p.name, p.type, p.host, p.access_code ?? '', p.serial ?? ''])
        : [
            ['Mei', 'bambu', 'rc-bambu-mei.wifi.local.cmu.edu', '', ''],
            ['Canis', 'elegoo', 'rc-centauri-canis.wifi.local.cmu.edu', '', ''],
          ];
    const csvContent = [PRINTER_CSV_COLUMNS, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: createCorsHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="printers.csv"`,
      }),
    });
  }),
});

http.route({
  path: `${API_PREFIX}/upload_printers_csv`,
  method: 'OPTIONS',
  handler: httpAction(async () => handlePreflight()),
});

// Add or update printers from a CSV with the columns above. Responds with the
// counts, or 400 and every problem found (nothing is saved then).
http.route({
  path: `${API_PREFIX}/upload_printers_csv`,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const courseId = getCourseIdFromRequest(request);
    const parsed = await ctx.runAction(internal.actions.parseCsvNode, {
      csvText: await (await request.blob()).text(),
    });

    const rows = (parsed as Record<string, unknown>[]).map((raw) => {
      // match headers loosely: "Access Code", "access_code", "HOST" ...
      const cells = new Map(
        Object.entries(raw).map(([k, val]) => [
          k.trim().toLowerCase().replace(/\s+/g, '_'),
          String(val ?? '').trim(),
        ]),
      );
      const optional = (key: string) => cells.get(key) || undefined;
      return {
        name: cells.get('name') ?? '',
        type: cells.get('type') ?? '',
        host: cells.get('host') ?? cells.get('url') ?? '',
        access_code: optional('access_code'),
        serial: optional('serial'),
      };
    });

    try {
      // checks that the caller is an admin
      const result = await ctx.runMutation(api.printers.importPrinters, { courseId, rows });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: createCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    } catch (error) {
      const message =
        error instanceof ConvexError ? String(error.data) : 'Could not import printers';
      return new Response(message, { status: 400, headers: createCorsHeaders() });
    }
  }),
});

// printer-bridge/ runs next to the backend and calls these on the HTTP actions
// port directly, so they aren't exposed through nginx. Both need the shared
// secret: `npx convex env set PRINTER_BRIDGE_SECRET <secret>`; unset disables them.
function isPrinterBridge(request: Request) {
  const secret = process.env.PRINTER_BRIDGE_SECRET;
  return !!secret && request.headers.get('Authorization') === `Bearer ${secret}`;
}

// The printers to watch, with their access codes.
http.route({
  path: `${API_PREFIX}/printer_config`,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!isPrinterBridge(request)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const printers = await ctx.runQuery(internal.printers.internalGetBridgeConfig, {});
    return new Response(JSON.stringify({ printers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

// Live status of each printer.
http.route({
  path: `${API_PREFIX}/printer_status`,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!isPrinterBridge(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('Body must be JSON', { status: 400 });
    }

    try {
      // the mutation's validator checks the body's shape
      await ctx.runMutation(
        internal.printers.internalUpdatePrinterStatus,
        body as FunctionArgs<typeof internal.printers.internalUpdatePrinterStatus>,
      );
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), {
        status: 400,
      });
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;
