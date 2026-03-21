import type { DoublePlay } from "@kexp-doubleplay/types";

export interface DoublePlayRow {
  id: number;
  artist: string;
  title: string;
  dj: string | null;
  show_name: string | null;
  classification: string | null;
  youtube_id: string | null;
  first_play_timestamp: string;
  play_count: number;
  plays_json: string;
}

export interface ScanStateRow {
  start_time: string;
  end_time: string;
  total_scan_time_ms: number;
  total_api_requests: number;
  last_scan_duration: number;
  last_scan_requests: number;
  last_scan_time: string | null;
  scan_direction: string;
}

export function rowToDoublePlay(row: DoublePlayRow): DoublePlay {
  return {
    artist: row.artist,
    title: row.title,
    plays: JSON.parse(row.plays_json),
    dj: row.dj ?? undefined,
    show: row.show_name ?? undefined,
    classification:
      (row.classification as DoublePlay["classification"]) ?? undefined,
    youtube_id: row.youtube_id ?? undefined,
  };
}

export async function getCounts(
  db: D1Database,
): Promise<{ legitimate: number; partial: number; mistake: number }> {
  const { results } = await db
    .prepare(
      "SELECT classification, COUNT(*) as count FROM double_plays GROUP BY classification",
    )
    .all<{ classification: string; count: number }>();

  const counts = { legitimate: 0, partial: 0, mistake: 0 };
  for (const row of results) {
    if (row.classification in counts) {
      counts[row.classification as keyof typeof counts] = row.count;
    }
  }
  return counts;
}
