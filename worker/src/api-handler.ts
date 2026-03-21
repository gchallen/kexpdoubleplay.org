import type {
  DoublePlaysResponse,
  PaginatedResponse,
  StatsResponse,
  ApiInfoResponse,
} from "@kexp-doubleplay/types";
import { PaginationQuerySchema } from "@kexp-doubleplay/types";
import type { Env } from "./types";
import {
  type DoublePlayRow,
  type ScanStateRow,
  rowToDoublePlay,
  getCounts,
} from "./db";
import { renderFrontend } from "./frontend";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Static routes
    switch (path) {
      case "/":
        return await renderFrontend(request, env);
      case "/api/health":
        return await handleHealth(env);
      case "/api/double-plays":
        return await handleDoublePlays(env);
      case "/api/double-plays/paginated":
        return await handlePaginated(url, env);
      case "/api/stats":
        return await handleStats(env);
      case "/api":
        return handleApiInfo();
    }

    // Dynamic routes: PUT /api/double-plays/:id/youtube
    const ytMatch = path.match(/^\/api\/double-plays\/(\d+)\/youtube$/);
    if (ytMatch) {
      return await handleSetYouTube(parseInt(ytMatch[1]), request, env);
    }

    // Admin routes
    if (path === "/api/admin/seed") {
      return await handleSeed(request, env);
    }
    if (path === "/api/admin/youtube-bulk") {
      return await handleYouTubeBulk(request, env);
    }

    return json(
      {
        error: "Endpoint not found",
        availableEndpoints: [
          "/api",
          "/api/health",
          "/api/double-plays",
          "/api/double-plays/paginated",
          "/api/stats",
        ],
      },
      404,
    );
  } catch (err) {
    return json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      500,
    );
  }
}

// --- helpers ---

function daysBetween(start: string, end: string): number {
  return Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
  );
}

async function getScanState(db: D1Database): Promise<ScanStateRow> {
  const row = await db
    .prepare("SELECT * FROM scan_state WHERE id = 1")
    .first<ScanStateRow>();
  return (
    row ?? {
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      total_scan_time_ms: 0,
      total_api_requests: 0,
      last_scan_duration: 0,
      last_scan_requests: 0,
      last_scan_time: null,
      scan_direction: "forward",
    }
  );
}

// --- route handlers ---

async function handleHealth(env: Env): Promise<Response> {
  const state = await getScanState(env.DB);
  const counts = (
    await env.DB.prepare(
      "SELECT COUNT(*) as total, COUNT(youtube_id) as yt FROM double_plays",
    ).first<{ total: number; yt: number }>()
  )!;
  const d = daysBetween(state.start_time, state.end_time);
  const avg =
    d > 0 ? parseFloat((counts.total / d).toFixed(2)) : 0;

  return json({
    status: "running",
    uptime: 0,
    startTime: new Date().toISOString(),
    lastScanTime: state.last_scan_time,
    lastError: null,
    retrievalStatus: "running",
    scanner: {
      earliestScanDate: state.start_time,
      latestScanDate: state.end_time,
      totalDoublePlays: counts.total,
      scanDuration: d,
      avgDoublePlaysPerDay: avg,
      dataFileExists: true,
    },
    scanningProgress: null,
    kexpApi: {
      isHealthy: true,
      consecutiveFailures: 0,
      lastFailureTime: null,
    },
    youtube: {
      enabled: true,
      lastUpdate: null,
      entriesCount: counts.yt,
      isStale: false,
    },
    system: {
      nodeVersion: "cloudflare-workers",
      platform: "cloudflare",
      architecture: "v8",
      memoryUsage: { rss: 0, heapUsed: 0, heapTotal: 0, external: 0 },
      loadAverage: null,
      cpuCount: 0,
    },
    api: { version: "2.0.0", timestamp: new Date().toISOString() },
  });
}

async function handleDoublePlays(env: Env): Promise<Response> {
  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM double_plays ORDER BY first_play_timestamp DESC",
  ).all<DoublePlayRow>();

  const doublePlays = rows.map(rowToDoublePlay);
  const state = await getScanState(env.DB);
  const counts = await getCounts(env.DB);
  const d = daysBetween(state.start_time, state.end_time);

  const response: DoublePlaysResponse = {
    startTime: state.start_time,
    endTime: state.end_time,
    totalCount: doublePlays.length,
    counts,
    retrievalStatus: "running",
    doublePlays,
    metadata: {
      generatedAt: new Date().toISOString(),
      retrievalStatus: "running",
      kexpApiHealth: { isHealthy: true, consecutiveFailures: 0 },
      timeRange: {
        earliest: state.start_time,
        latest: state.end_time,
        durationDays: d,
      },
    },
  };

  return json(response);
}

async function handlePaginated(url: URL, env: Env): Promise<Response> {
  const parsed = PaginationQuerySchema.safeParse({
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit"),
  });

  if (!parsed.success) {
    return json(
      {
        error: "Invalid query parameters",
        message: "page must be >= 1, limit between 1 and 100",
      },
      400,
    );
  }

  const { page, limit } = parsed.data;
  const total = (
    await env.DB.prepare(
      "SELECT COUNT(*) as c FROM double_plays",
    ).first<{ c: number }>()
  )!.c;

  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM double_plays ORDER BY first_play_timestamp DESC LIMIT ? OFFSET ?",
  )
    .bind(limit, (page - 1) * limit)
    .all<DoublePlayRow>();

  const doublePlays = rows.map(rowToDoublePlay);
  const state = await getScanState(env.DB);
  const totalPages = Math.ceil(total / limit);

  const response: PaginatedResponse = {
    page,
    limit,
    totalCount: total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    doublePlays,
    timeRange: { earliest: state.start_time, latest: state.end_time },
  };

  return json(response);
}

async function handleStats(env: Env): Promise<Response> {
  const state = await getScanState(env.DB);

  const summary = await env.DB.prepare(
    `SELECT COUNT(*) as total, COUNT(DISTINCT artist) as artists,
     COUNT(DISTINCT dj) as djs, COUNT(DISTINCT show_name) as shows
     FROM double_plays`,
  ).first<{
    total: number;
    artists: number;
    djs: number;
    shows: number;
  }>();

  const { results: topArtists } = await env.DB.prepare(
    "SELECT artist, COUNT(*) as count FROM double_plays GROUP BY artist ORDER BY count DESC LIMIT 10",
  ).all<{ artist: string; count: number }>();

  const { results: topDJs } = await env.DB.prepare(
    "SELECT dj, COUNT(*) as count FROM double_plays WHERE dj IS NOT NULL GROUP BY dj ORDER BY count DESC LIMIT 5",
  ).all<{ dj: string; count: number }>();

  const { results: topShows } = await env.DB.prepare(
    "SELECT show_name, COUNT(*) as count FROM double_plays WHERE show_name IS NOT NULL GROUP BY show_name ORDER BY count DESC LIMIT 5",
  ).all<{ show_name: string; count: number }>();

  const { results: distRows } = await env.DB.prepare(
    "SELECT play_count, COUNT(*) as count FROM double_plays GROUP BY play_count",
  ).all<{ play_count: number; count: number }>();

  const dist: Record<string, number> = {};
  for (const r of distRows) dist[String(r.play_count)] = r.count;

  const d = daysBetween(state.start_time, state.end_time);

  const response: StatsResponse = {
    summary: {
      totalDoublePlays: summary?.total ?? 0,
      uniqueArtists: summary?.artists ?? 0,
      uniqueDJs: summary?.djs ?? 0,
      uniqueShows: summary?.shows ?? 0,
      timespan: {
        start: state.start_time,
        end: state.end_time,
        days: d,
      },
    },
    topArtists: topArtists.map((r) => ({ artist: r.artist, count: r.count })),
    topDJs: topDJs.map((r) => ({ dj: r.dj, count: r.count })),
    topShows: topShows.map((r) => ({
      show: r.show_name,
      count: r.count,
    })),
    playCountDistribution: dist,
    generatedAt: new Date().toISOString(),
  };

  return json(response);
}

async function handleSetYouTube(
  id: number,
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json()) as {
    youtube_id?: string | null;
  };
  const youtubeId = body.youtube_id?.trim() || null;

  const result = await env.DB.prepare(
    "UPDATE double_plays SET youtube_id = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(youtubeId, id)
    .run();

  if (result.meta.changes === 0) {
    return json({ error: "Double play not found" }, 404);
  }

  return json({ ok: true, id, youtube_id: youtubeId });
}

// --- admin endpoints ---

function requireAuth(
  request: Request,
  env: Env,
): Response | null {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

/**
 * POST /api/admin/seed
 * Import double-plays.json (the full DoublePlayData blob).
 * Replaces all existing data.
 */
async function handleSeed(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const denied = requireAuth(request, env);
  if (denied) return denied;

  const data = (await request.json()) as {
    startTime: string;
    endTime: string;
    doublePlays: Array<{
      artist: string;
      title: string;
      plays: any[];
      dj?: string;
      show?: string;
      classification?: string;
      youtube_id?: string;
    }>;
    scanStats?: {
      totalScanTimeMs?: number;
      totalApiRequests?: number;
      lastScanTime?: string;
    };
  };

  // Clear existing data
  await env.DB.prepare("DELETE FROM double_plays").run();

  // Batch insert double plays (chunks of 50 for D1 batch limits)
  const CHUNK = 50;
  let imported = 0;
  for (let i = 0; i < data.doublePlays.length; i += CHUNK) {
    const chunk = data.doublePlays.slice(i, i + CHUNK);
    const stmts = chunk.map((dp) =>
      env.DB.prepare(
        `INSERT INTO double_plays
         (artist, title, dj, show_name, classification, youtube_id,
          first_play_timestamp, play_count, plays_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        dp.artist,
        dp.title,
        dp.dj || null,
        dp.show || null,
        dp.classification || "legitimate",
        dp.youtube_id || null,
        dp.plays[0].timestamp,
        dp.plays.length,
        JSON.stringify(dp.plays),
      ),
    );
    await env.DB.batch(stmts);
    imported += chunk.length;
  }

  // Update scan state
  await env.DB.prepare(
    `UPDATE scan_state SET start_time = ?, end_time = ?,
     total_api_requests = ?, total_scan_time_ms = ?,
     last_scan_time = ?, scan_direction = 'forward' WHERE id = 1`,
  )
    .bind(
      data.startTime,
      data.endTime,
      data.scanStats?.totalApiRequests ?? 0,
      data.scanStats?.totalScanTimeMs ?? 0,
      data.scanStats?.lastScanTime ?? new Date().toISOString(),
    )
    .run();

  return json({
    ok: true,
    imported,
    scanState: {
      startTime: data.startTime,
      endTime: data.endTime,
    },
  });
}

/**
 * POST /api/admin/youtube-bulk
 * Bulk-set YouTube IDs. Body: [{ artist, title, youtube_id }, ...]
 * Matches by case-insensitive artist + title.
 */
async function handleYouTubeBulk(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const denied = requireAuth(request, env);
  if (denied) return denied;

  const entries = (await request.json()) as Array<{
    artist: string;
    title: string;
    youtube_id: string;
  }>;

  let updated = 0;
  let notFound = 0;

  for (const entry of entries) {
    const result = await env.DB.prepare(
      `UPDATE double_plays SET youtube_id = ?, updated_at = datetime('now')
       WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)`,
    )
      .bind(entry.youtube_id, entry.artist, entry.title)
      .run();

    if (result.meta.changes > 0) {
      updated++;
    } else {
      notFound++;
    }
  }

  return json({ ok: true, updated, notFound, total: entries.length });
}

// --- info ---

function handleApiInfo(): Response {
  const response: ApiInfoResponse = {
    name: "KEXP Double Play Scanner API",
    version: "2.0.0",
    description: "Cloudflare Worker API for KEXP double play data",
    endpoints: {
      "/api/health": "Scanner health and status information",
      "/api/double-plays": "All double plays data",
      "/api/double-plays/paginated":
        "Paginated double plays (query: ?page=1&limit=10)",
      "/api/stats": "Statistics about double plays",
      "/api/double-plays/:id/youtube":
        "Set YouTube ID (PUT, requires Authorization header)",
      "/api/admin/seed":
        "Import double-plays.json (POST, requires Authorization)",
      "/api/admin/youtube-bulk":
        "Bulk set YouTube IDs (POST, requires Authorization)",
    },
    timestamp: new Date().toISOString(),
  };
  return json(response);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
