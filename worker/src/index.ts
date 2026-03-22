import type { Env } from "./types";
import type { DoublePlay, KEXPPlay } from "@kexp-doubleplay/types";
import { handleRequest } from "./api-handler";
import { fetchPlays, fetchShowInfo } from "./kexp-api";
import { detectDoublePlays } from "./detector";
import { sendDoublePlayNotification, sendWarning } from "./notify";
import type { ScanStateRow } from "./db";

const SCAN_OVERLAP_MINUTES = 15;
const MAX_SCAN_HOURS = 1;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await runScan(env, ctx);
  },
};

async function runScan(env: Env, ctx: ExecutionContext): Promise<void> {
  const scanStart = Date.now();
  console.log("Scan cron triggered");

  // Read scan state
  let state = await env.DB.prepare(
    "SELECT * FROM scan_state WHERE id = 1",
  ).first<ScanStateRow>();

  if (!state) {
    const start = new Date(Date.now() - 7 * 86400000).toISOString();
    await env.DB.prepare(
      "INSERT INTO scan_state (id, start_time, end_time) VALUES (1, ?, ?)",
    )
      .bind(start, start)
      .run();
    state = {
      start_time: start,
      end_time: start,
      total_scan_time_ms: 0,
      total_api_requests: 0,
      last_scan_duration: 0,
      last_scan_requests: 0,
      last_scan_time: null,
      scan_direction: "forward",
    };
  }

  const lastEnd = new Date(state.end_time).getTime();
  const now = Date.now();
  const newEnd = new Date(
    Math.min(now, lastEnd + MAX_SCAN_HOURS * 3600000),
  );
  const fetchStart = new Date(lastEnd - SCAN_OVERLAP_MINUTES * 60000);

  console.log(
    `Fetching: ${fetchStart.toISOString()} -> ${newEnd.toISOString()}`,
  );

  try {
    const plays = await fetchPlays(
      env.KEXP_API_BASE_URL,
      fetchStart.toISOString(),
      newEnd.toISOString(),
    );
    console.log(`Fetched ${plays.length} plays`);

    const enrichPlay = async (play: KEXPPlay): Promise<KEXPPlay> => {
      if (!play.show?.id) return play;
      try {
        const info = await fetchShowInfo(
          env.KEXP_API_BASE_URL,
          play.show.id,
        );
        return {
          ...play,
          show: { id: play.show.id, name: info.programName },
          host: info.hostName
            ? { id: 0, name: info.hostName }
            : undefined,
        };
      } catch {
        return play;
      }
    };

    const detected = await detectDoublePlays(plays, enrichPlay);
    const trulyNew: DoublePlay[] = [];

    for (const dp of detected) {
      const { results: candidates } = await env.DB.prepare(
        "SELECT id, plays_json FROM double_plays WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)",
      )
        .bind(dp.artist, dp.title)
        .all<{ id: number; plays_json: string }>();

      const newStart = new Date(dp.plays[0].timestamp).getTime();
      const newLast = new Date(
        dp.plays[dp.plays.length - 1].timestamp,
      ).getTime();

      let matchId: number | null = null;
      let matchPlays: any[] | null = null;

      for (const c of candidates) {
        const existing = JSON.parse(c.plays_json);
        const eStart = new Date(existing[0].timestamp).getTime();
        const eEnd = new Date(
          existing[existing.length - 1].timestamp,
        ).getTime();
        if (eStart <= newLast && eEnd >= newStart) {
          matchId = c.id;
          matchPlays = existing;
          break;
        }
      }

      if (matchId !== null && matchPlays !== null) {
        const ids = new Set(
          matchPlays.map((p: any) => p.play_id),
        );
        const merged = [...matchPlays];
        for (const p of dp.plays) {
          if (!ids.has(p.play_id)) merged.push(p);
        }
        merged.sort(
          (a: any, b: any) =>
            new Date(a.timestamp).getTime() -
            new Date(b.timestamp).getTime(),
        );

        await env.DB.prepare(
          `UPDATE double_plays SET plays_json = ?, play_count = ?,
           dj = COALESCE(dj, ?), show_name = COALESCE(show_name, ?),
           updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(
            JSON.stringify(merged),
            merged.length,
            dp.dj || null,
            dp.show || null,
            matchId,
          )
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO double_plays
           (artist, title, dj, show_name, classification, first_play_timestamp, play_count, plays_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            dp.artist,
            dp.title,
            dp.dj || null,
            dp.show || null,
            dp.classification || "legitimate",
            dp.plays[0].timestamp,
            dp.plays.length,
            JSON.stringify(dp.plays),
          )
          .run();

        trulyNew.push(dp);
      }
    }

    // Update scan state
    await env.DB.prepare(
      `UPDATE scan_state SET end_time = ?,
       total_api_requests = total_api_requests + 1,
       last_scan_time = ?, last_scan_requests = 1,
       scan_direction = 'forward' WHERE id = 1`,
    )
      .bind(newEnd.toISOString(), new Date().toISOString())
      .run();

    const total = (
      await env.DB.prepare(
        "SELECT COUNT(*) as c FROM double_plays",
      ).first<{ c: number }>()
    )!.c;
    console.log(`Saved. Total: ${total}, new: ${trulyNew.length}`);

    // Email notifications for truly new double plays
    for (const dp of trulyNew) {
      ctx.waitUntil(sendDoublePlayNotification(env, dp));
    }
    // Self-monitoring: warn if scan wall time is unusually long
    const elapsed = Date.now() - scanStart;
    console.log(`Scan completed in ${elapsed}ms`);
    if (elapsed > 120000) {
      ctx.waitUntil(
        sendWarning(
          env,
          `Scan took ${(elapsed / 1000).toFixed(1)}s wall time — may indicate issues with KEXP API or excessive requests`,
        ),
      );
    }
  } catch (err) {
    console.error(
      "Scan failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
