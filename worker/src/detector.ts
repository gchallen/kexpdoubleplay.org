import type { KEXPPlay, DoublePlay } from "@kexp-doubleplay/types";

type EnrichFn = (play: KEXPPlay) => Promise<KEXPPlay>;

/**
 * Detect double plays from a list of KEXP plays.
 */
export async function detectDoublePlays(
  plays: KEXPPlay[],
  enrichPlay?: EnrichFn,
): Promise<DoublePlay[]> {
  const doublePlays: DoublePlay[] = [];

  // Filter plays with backwards timestamps (sorted by ID, timestamps must be non-decreasing)
  const sortedById = [...plays].sort((a, b) => a.play_id - b.play_id);
  const filtered: KEXPPlay[] = [];
  let lastTs = 0;
  for (const play of sortedById) {
    const ts = new Date(play.airdate).getTime();
    if (ts >= lastTs) {
      filtered.push(play);
      lastTs = ts;
    }
  }

  // Sort by timestamp for detection
  const sorted = filtered.sort(
    (a, b) => new Date(a.airdate).getTime() - new Date(b.airdate).getTime(),
  );

  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i];
    if (
      current.play_type !== "trackplay" ||
      !current.artist ||
      !current.song
    ) {
      i++;
      continue;
    }

    // Collect consecutive plays of the same song (skipping airbreaks)
    const group: KEXPPlay[] = [current];
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      if (next.play_type === "trackplay") {
        if (isSameSong(current, next)) {
          group.push(next);
          j++;
        } else {
          break;
        }
      } else {
        j++; // skip airbreaks
      }
    }

    if (group.length >= 2) {
      // Enrich first play with show/DJ info
      let enrichedFirst = group[0];
      if (enrichPlay) {
        try {
          enrichedFirst = await enrichPlay(group[0]);
        } catch {
          /* use unenriched */
        }
      }

      const dpPlays = group.map((play) => {
        const idx = sorted.indexOf(play);
        const endTimestamp =
          idx < sorted.length - 1 ? sorted[idx + 1].airdate : undefined;

        let duration: number | undefined;
        if (endTimestamp) {
          duration = Math.round(
            (new Date(endTimestamp).getTime() -
              new Date(play.airdate).getTime()) /
              1000,
          );
        }

        return {
          timestamp: play.airdate,
          end_timestamp: endTimestamp,
          play_id: play.play_id,
          duration,
          kexpPlay: play,
        };
      });

      doublePlays.push({
        artist: current.artist,
        title: current.song,
        plays: dpPlays,
        dj: enrichedFirst.host?.name,
        show: enrichedFirst.show?.name,
        classification: classify(dpPlays),
      });
      i = j;
    } else {
      i++;
    }
  }

  return doublePlays;
}

/**
 * Merge newly detected double plays into existing list, deduplicating by play_id.
 * New (non-overlapping) entries are appended at the end.
 */
export function mergeDoublePlays(
  existing: DoublePlay[],
  incoming: DoublePlay[],
): DoublePlay[] {
  const merged = [...existing];

  for (const dp of incoming) {
    const idx = merged.findIndex(
      (e) =>
        e.artist.toLowerCase() === dp.artist.toLowerCase() &&
        e.title.toLowerCase() === dp.title.toLowerCase() &&
        overlaps(e, dp),
    );

    if (idx >= 0) {
      // Merge plays into existing entry
      const ids = new Set(merged[idx].plays.map((p) => p.play_id));
      for (const p of dp.plays) {
        if (!ids.has(p.play_id)) merged[idx].plays.push(p);
      }
      merged[idx].plays.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      if (!merged[idx].dj && dp.dj) merged[idx].dj = dp.dj;
      if (!merged[idx].show && dp.show) merged[idx].show = dp.show;
      merged[idx].classification = classify(merged[idx].plays);
    } else {
      merged.push(dp);
    }
  }

  return merged;
}

// --- helpers ---

function isSameSong(a: KEXPPlay, b: KEXPPlay): boolean {
  if (a.artist?.toLowerCase() !== b.artist?.toLowerCase()) return false;
  if (a.song?.toLowerCase() !== b.song?.toLowerCase()) return false;
  const al1 = a.album?.toLowerCase();
  const al2 = b.album?.toLowerCase();
  if (al1 && al2) return al1 === al2;
  return true;
}

function overlaps(a: DoublePlay, b: DoublePlay): boolean {
  const [s1, e1] = timeRange(a);
  const [s2, e2] = timeRange(b);
  return s1 <= e2 && e1 >= s2;
}

function timeRange(dp: DoublePlay): [number, number] {
  return [
    new Date(dp.plays[0].timestamp).getTime(),
    new Date(dp.plays[dp.plays.length - 1].timestamp).getTime(),
  ];
}

export interface PlayEntry {
  timestamp: string;
  end_timestamp?: string;
  play_id: number;
  duration?: number;
  kexpPlay: KEXPPlay;
}

export function classify(
  plays: PlayEntry[],
): "legitimate" | "partial" | "mistake" {
  if (plays.length < 2) return "legitimate";

  const gap = Math.round(
    (new Date(plays[1].timestamp).getTime() -
      new Date(plays[0].timestamp).getTime()) /
      1000,
  );

  if (plays.every((p) => p.duration !== undefined)) {
    if (plays.some((p) => p.duration! < 30)) return "mistake";
    const d1 = plays[0].duration!;
    const d2 = plays[1].duration!;
    const max = Math.max(d1, d2);
    const min = Math.min(d1, d2);
    const pct = ((max - min) / max) * 100;
    const abs = max - min;
    if (pct > 50 || (abs > 120 && pct > 30)) return "partial";
    return "legitimate";
  }

  if (gap < 30) return "mistake";
  if (gap < 60) return "partial";
  return "legitimate";
}
