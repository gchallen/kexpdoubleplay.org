#!/usr/bin/env bun
/**
 * Interactive YouTube ID updater.
 *
 * Fetches all double plays from the production API, opens a Puppeteer window
 * on the YouTube search URL for each unmapped track, and pushes the chosen
 * video ID (or the empty-string "ignored" sentinel) back to D1 via the bulk
 * admin endpoint. No local file of record — D1 is the source of truth.
 */
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { DoublePlay, DoublePlaysResponse } from "@kexp-doubleplay/types";

const API_BASE = process.env.KEXP_DP_API_BASE ?? "https://kexpdoubleplays.org";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error(
    "ADMIN_TOKEN not set. Add it to .env at the repo root and run `direnv allow`.",
  );
  process.exit(1);
}

interface Track {
  artist: string;
  title: string;
  album: string | null;
  durations: number[];
}

function dedupeUnmapped(doublePlays: DoublePlay[]): Track[] {
  const byKey = new Map<string, Track>();

  for (const dp of doublePlays) {
    if (dp.youtube_id !== undefined && dp.youtube_id !== null) continue;

    const key = `${dp.artist.toLowerCase()}|${dp.title.toLowerCase()}`;
    const existing = byKey.get(key);

    const firstKexp = dp.plays[0]?.kexpPlay;
    const album = firstKexp?.album ?? null;
    const durations = dp.plays
      .map((p) => p.duration)
      .filter((d): d is number => typeof d === "number" && d >= 30);

    if (existing) {
      existing.durations.push(...durations);
      if (existing.album === null && album) existing.album = album;
    } else {
      byKey.set(key, {
        artist: dp.artist,
        title: dp.title,
        album,
        durations,
      });
    }
  }

  return Array.from(byKey.values());
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDurations(durations: number[]): string {
  if (durations.length === 0) return "";
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  if (max - min > 10) {
    return durations.map(formatDuration).join(", ");
  }
  return formatDuration(durations[0]);
}

function searchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`;
}

function extractYouTubeId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

function prompt(msg: string): Promise<string> {
  process.stdout.write(msg);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    const onData = (data: string) => {
      stdin.off("data", onData);
      resolve(data.toString().trim());
    };
    stdin.on("data", onData);
  });
}

async function fetchDoublePlays(): Promise<DoublePlay[]> {
  const res = await fetch(`${API_BASE}/api/double-plays`);
  if (!res.ok) {
    throw new Error(`GET /api/double-plays failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as DoublePlaysResponse;
  return body.doublePlays;
}

async function pushYouTubeId(
  artist: string,
  title: string,
  youtubeId: string,
): Promise<{ updated: number; notFound: number }> {
  const res = await fetch(`${API_BASE}/api/admin/youtube-bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify([{ artist, title, youtube_id: youtubeId }]),
  });
  if (!res.ok) {
    throw new Error(
      `POST /api/admin/youtube-bulk failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
  return (await res.json()) as { updated: number; notFound: number };
}

async function run(): Promise<void> {
  console.log(`Fetching double plays from ${API_BASE} ...`);
  const all = await fetchDoublePlays();
  const tracks = dedupeUnmapped(all);
  console.log(
    `Found ${all.length} total double plays; ${tracks.length} unique unmapped tracks.`,
  );

  if (tracks.length === 0) {
    console.log("Nothing to do — every track is already mapped or ignored.");
    return;
  }

  let browser: Browser | undefined;
  const stats = { picked: 0, ignored: 0, skipped: 0 };

  const cleanup = async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = undefined;
    }
  };
  process.once("SIGINT", async () => {
    console.log("\nInterrupted — closing browser.");
    await cleanup();
    process.exit(130);
  });

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"],
    });
    const pages = await browser.pages();
    const page: Page = pages[0] ?? (await browser.newPage());

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const durText = t.durations.length ? ` [${formatDurations(t.durations)}]` : "";
      const albumText = t.album ? ` (${t.album})` : "";
      console.log(
        `\n[${i + 1}/${tracks.length}] ${t.artist} — "${t.title}"${albumText}${durText}`,
      );

      await page.goto(searchUrl(t.artist, t.title), { waitUntil: "networkidle2" });

      console.log(
        "  c/current = use current URL · i/ignore = hide permanently · <paste URL> · Enter = skip",
      );
      const answer = (await prompt("  > ")).toLowerCase();

      if (answer === "i" || answer === "ignore") {
        const r = await pushYouTubeId(t.artist, t.title, "");
        stats.ignored++;
        console.log(`  🚫 ignored (updated ${r.updated}, notFound ${r.notFound})`);
        continue;
      }

      let url = "";
      if (answer === "c" || answer === "current") {
        url = page.url();
      } else if (answer) {
        url = answer;
      } else {
        stats.skipped++;
        console.log("  ⏭  skipped");
        continue;
      }

      const id = extractYouTubeId(url);
      if (!id) {
        stats.skipped++;
        console.log(`  ⚠️  could not extract YouTube ID from "${url}" — skipping`);
        continue;
      }

      const r = await pushYouTubeId(t.artist, t.title, id);
      stats.picked++;
      console.log(`  ✅ ${id} (updated ${r.updated}, notFound ${r.notFound})`);
    }
  } finally {
    await cleanup();
  }

  console.log(
    `\nDone. picked=${stats.picked} ignored=${stats.ignored} skipped=${stats.skipped}`,
  );
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
