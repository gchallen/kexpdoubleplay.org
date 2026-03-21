import type { KEXPPlay } from "@kexp-doubleplay/types";

const RATE_LIMIT_MS = 1000;
const TIMEOUT_MS = 30000;

const HEADERS = {
  "User-Agent": "KEXP-DoublePlay-Scanner/2.0",
  Accept: "application/json",
};

export async function fetchPlays(
  baseUrl: string,
  startTime: string,
  endTime: string,
): Promise<KEXPPlay[]> {
  const plays: KEXPPlay[] = [];
  let nextUrl: string | null =
    `${baseUrl}/plays/?airdate_after=${encodeURIComponent(startTime)}&airdate_before=${encodeURIComponent(endTime)}&ordering=airdate`;
  let pages = 0;

  while (nextUrl) {
    if (++pages > 100) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(nextUrl, {
        signal: controller.signal,
        headers: HEADERS,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`KEXP API ${res.status} ${res.statusText}`);
      }

      const body = (await res.json()) as {
        results?: any[];
        next?: string;
      };

      for (const r of body.results ?? []) {
        plays.push({
          airdate: r.airdate,
          artist: r.artist || "",
          song: r.song || "",
          album: r.album,
          play_id: r.id,
          play_type: r.play_type,
          image_uri: r.image_uri,
          thumbnail_uri: r.thumbnail_uri,
          show: r.show ? { id: r.show, name: "Unknown Show" } : undefined,
          host: undefined,
        });
      }

      const prev: string = nextUrl;
      nextUrl = body.next || null;
      if (nextUrl === prev || !body.results?.length) break;

      if (nextUrl) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  return plays;
}

export async function fetchShowInfo(
  baseUrl: string,
  showId: number,
): Promise<{ programName: string; hostName?: string }> {
  const res = await fetch(`${baseUrl}/shows/${showId}/`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`Show API ${res.status}`);

  const data = (await res.json()) as any;
  return {
    programName: data.program_name || "Unknown Show",
    hostName: data.host_names?.[0],
  };
}
