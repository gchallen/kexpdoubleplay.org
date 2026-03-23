import type { DoublePlay } from "@kexp-doubleplay/types";
import type { Env } from "./types";
import {
  type DoublePlayRow,
  type ScanStateRow,
  rowToDoublePlay,
} from "./db";

export async function renderFrontend(
  request: Request,
  env: Env,
): Promise<Response> {
  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM double_plays ORDER BY first_play_timestamp DESC",
  ).all<DoublePlayRow>();

  const allPlays = rows.map(rowToDoublePlay);

  // Parse filters from URL
  const url = new URL(request.url);
  const showAll = url.searchParams.get("show") === "all";
  const djParam = url.searchParams.get("dj") || "";
  const selectedDJs = new Set(djParam ? djParam.split(",") : []);

  // Count plays per DJ (respecting the show-all toggle)
  const djCounts = new Map<string, number>();
  for (const dp of allPlays) {
    if (!dp.dj) continue;
    if (!showAll && dp.classification === "mistake") continue;
    djCounts.set(dp.dj, (djCounts.get(dp.dj) || 0) + 1);
  }
  // Only DJs with >1 double play, sorted by count desc then name
  const djList = [...djCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Apply filters
  let doublePlays = allPlays.filter((dp) => dp.youtube_id !== null);
  if (!showAll) {
    doublePlays = doublePlays.filter((dp) => dp.classification !== "mistake");
  }
  if (selectedDJs.size > 0) {
    doublePlays = doublePlays.filter((dp) => dp.dj && selectedDJs.has(dp.dj));
  }

  const state = await env.DB.prepare(
    "SELECT * FROM scan_state WHERE id = 1",
  ).first<ScanStateRow>();
  const lastFetch = state?.last_scan_time || state?.end_time || null;

  // Theme from cookie
  const cookies = request.headers.get("cookie") || "";
  const isDark = /theme=dark/.test(cookies);
  const themeClass = isDark ? "dark" : "";
  const sunDisplay = isDark ? "block" : "none";
  const moonDisplay = isDark ? "none" : "block";

  const ytCount = doublePlays.filter((dp) => dp.youtube_id).length;
  const totalCount = allPlays.filter((dp) => dp.classification !== "mistake").length;
  const mistakeCount = allPlays.filter((dp) => dp.classification === "mistake").length;
  const filterDesc = selectedDJs.size > 0 ? ` by ${[...selectedDJs].join(", ")}` : "";
  const statusText = `Showing ${doublePlays.length} of ${totalCount} double plays${filterDesc}${mistakeCount > 0 && showAll ? ` (includes ${mistakeCount} mistakes)` : ""}${ytCount > 0 ? ` &bull; ${ytCount} with YouTube` : ""} &bull; Last updated: <span class="timestamp" data-ts="${lastFetch || ""}"></span>`;

  // Build DJ checkboxes
  const djOptions = djList
    .map(([dj, count]) => {
      const checked = selectedDJs.has(dj) ? " checked" : "";
      return `<label class="dj-chip"><input type="checkbox" class="dj-cb" value="${escAttr(dj)}" onchange="applyFilters()"${checked}><span>${escAttr(dj)} (${count})</span></label>`;
    })
    .join("");

  const items = doublePlays.map((dp, i) => renderItem(dp, doublePlays.length - i)).join("");

  const html = TEMPLATE.replace("{{THEME_CLASS}}", themeClass)
    .replace("{{SUN_DISPLAY}}", sunDisplay)
    .replace("{{MOON_DISPLAY}}", moonDisplay)
    .replace("{{STATUS_TEXT}}", statusText)
    .replace("{{DJ_OPTIONS}}", djOptions)
    .replace("{{SHOW_ALL_CHECKED}}", showAll ? " checked" : "")
    .replace("{{MISTAKE_COUNT}}", String(mistakeCount))
    .replace("{{DOUBLE_PLAYS_HTML}}", items);

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}

export function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderItem(dp: DoublePlay, i: number): string {
  const first = dp.plays[0];

  const playBtn = dp.youtube_id
    ? `<div class="play-button">
         <button class="play-btn" data-yt="${dp.youtube_id}" title="Play" style="position:relative;width:32px;height:32px">
           <svg viewBox="0 0 24 24" class="play-icon" style="position:absolute;inset:0"><polygon class="fill-black" points="5,3 19,12 5,21"></polygon></svg>
           <svg viewBox="0 0 24 24" class="pause-icon" style="position:absolute;inset:0;display:none"><rect class="fill-black" x="5" y="3" width="4" height="18"></rect><rect class="fill-black" x="15" y="3" width="4" height="18"></rect></svg>
         </button>
       </div>`
    : `<div class="play-button invisible"></div>`;

  const coverUri = dp.youtube_id
    ? `https://img.youtube.com/vi/${dp.youtube_id}/mqdefault.jpg`
    : dp.plays.find((p) => p.kexpPlay.image_uri)?.kexpPlay.image_uri;
  const cover = coverUri
    ? `<div class="album-cover-container"><img src="${coverUri}" alt="Album cover" class="album-cover" loading="lazy"></div>`
    : "";

  const ytAttr = dp.youtube_id ? ` data-yt="${dp.youtube_id}"` : "";
  const djShow = [dp.dj, dp.show].filter(Boolean).join(" \u2022 ");
  const album = first.kexpPlay.album || "";

  return `<div class="playlist-item"${ytAttr} data-title="${escAttr(dp.title)}" data-artist="${escAttr(dp.artist)}" data-album="${escAttr(album)}" data-dj-show="${escAttr(djShow)}">
  <div class="item-content">
    <div class="track-number">${i}</div>
    ${playBtn}
    <div class="timestamp" data-ts="${first.timestamp}"></div>
    <div class="track-info">
      <div class="track-title">${dp.title}</div>
      <div class="artist-name">${dp.artist}${first.kexpPlay.album ? ` &mdash; ${first.kexpPlay.album}` : ""}</div>
      <div class="show-dj-line">
        ${dp.dj ? `<span class="dj-name">${dp.dj}</span>` : ""}
        ${dp.dj && dp.show ? `<span class="separator"> &bull; </span>` : ""}
        ${dp.show ? `<span class="show-name">${dp.show}</span>` : ""}
      </div>
    </div>
    <div class="album-covers">${cover}</div>
  </div>
</div>`;
}

const TEMPLATE = `<!DOCTYPE html>
<html lang="en" class="{{THEME_CLASS}}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KEXP Double Plays</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #fafaf7;
            --text: #1a1a1a;
            --text-secondary: #6b6b6b;
            --border: #e8e5e0;
            --surface: #f3f1ec;
            --accent: #fbad18;
            --accent-dim: #fbad1830;
            --font-body: 'Libre Franklin', -apple-system, BlinkMacSystemFont, sans-serif;
            --font-title: 'Bebas Neue', sans-serif;
            --font-mono: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
        }
        .dark {
            --bg: #141414;
            --text: #edede8;
            --text-secondary: #9a9a95;
            --border: #2a2825;
            --surface: #1e1d1b;
            --accent: #fbad18;
            --accent-dim: #fbad1825;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--font-body);
            line-height: 1.6; background-color: var(--bg); color: var(--text);
            transition: background-color 0.2s, color 0.2s;
        }
        .container { max-width: 860px; margin: 0 auto; padding: 20px; }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border);
        }
        h1 {
            font-family: var(--font-title);
            font-size: 2.8rem; font-weight: 400; color: var(--text);
            text-transform: uppercase;
            color: var(--text);
            text-shadow: 6px 6px 0 var(--accent);
        }
        .theme-toggle {
            background: none; border: 1px solid var(--border); padding: 8px; border-radius: 4px;
            cursor: pointer; color: inherit; transition: border-color 0.2s, background-color 0.2s;
            display: flex; align-items: center; justify-content: center;
        }
        .theme-toggle:hover { background-color: var(--surface); border-color: var(--text-secondary); }
        .theme-icon { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .status-info { margin-bottom: 12px; font-size: 1rem; color: var(--text-secondary); }
        .filter-bar { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-bar label { font-family: var(--font-body); font-size: 0.9rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .filter-bar input[type="checkbox"] { cursor: pointer; accent-color: var(--accent); }
        .show-mistakes { margin-left: auto; font-size: 0.85rem; white-space: nowrap; }
        .dj-filters { display: flex; flex-wrap: wrap; gap: 6px; }
        .dj-chip { display: flex; align-items: center; gap: 4px; font-size: 0.9rem; color: var(--text-secondary);
            padding: 2px 8px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
            transition: background-color 0.15s, border-color 0.15s; }
        .dj-chip:hover { background: var(--surface); }
        .dj-chip:has(input:checked) { background: var(--accent-dim); border-color: var(--accent); color: var(--text); }
        .dj-chip input[type="checkbox"] { cursor: pointer; accent-color: var(--accent); }
        .playlist-item {
            padding: 20px; border-bottom: 1px solid var(--border);
            transition: background-color 0.2s; border-left: 3px solid transparent;
        }
        .playlist-item:hover { background-color: var(--surface); }
        .item-content { display: flex; align-items: center; width: 100%; }
        .track-number { flex-shrink: 0; margin-right: 16px; width: 32px; text-align: right; font-family: var(--font-mono); font-size: 1rem; color: var(--text-secondary); }
        .play-button { flex-shrink: 0; margin-right: 12px; width: 32px; height: 32px; }
        .play-button button { display: block; background: none; border: none; padding: 0; cursor: pointer; transition: opacity 0.2s; }
        .play-button button:hover { opacity: 0.8; }
        .play-button.invisible { visibility: hidden; }
        .play-button svg { width: 32px; height: 32px; }
        .play-button .fill-black { fill: var(--text); }

        /* Player bar */
        .player-bar {
            position: sticky; top: 0; z-index: 100;
            background: var(--surface); border-top: 2px solid var(--accent);
            border-bottom: 1px solid var(--border);
            padding: 8px 20px; display: flex; align-items: center; gap: 12px;
            min-height: 54px;
        }
        .player-bar .pb-thumb { width: 60px; height: 34px; min-width: 60px; min-height: 34px; border-radius: 3px; flex-shrink: 0; background-size: cover; background-position: center; }
        .player-bar .pb-info { flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
        .player-bar .pb-title { font-family: var(--font-body); font-size: 0.95rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-bar .pb-artist { font-family: var(--font-body); font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-bar .pb-controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .player-bar .pb-controls button {
            background: none; border: none; cursor: pointer; padding: 4px;
            color: inherit; display: flex; align-items: center; justify-content: center;
        }
        .player-bar .pb-controls button:hover { opacity: 0.7; }
        .player-bar .pb-controls svg { width: 22px; height: 22px; fill: currentColor; }
        .player-bar .pb-seek { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 360px; min-width: 120px; }
        .player-bar .pb-time { font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono); white-space: nowrap; min-width: 32px; }
        .player-bar input[type="range"] {
            -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
            background: var(--border); border-radius: 2px; outline: none; cursor: pointer;
        }
        .player-bar input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px;
            border-radius: 50%; background: var(--accent); cursor: pointer;
        }
        .player-bar input[type="range"]::-moz-range-thumb {
            width: 12px; height: 12px; border: none;
            border-radius: 50%; background: var(--accent); cursor: pointer;
        }
        .player-bar .pb-volume { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .player-bar .pb-volume button { background: none; border: none; cursor: pointer; padding: 2px; color: inherit; display: flex; }
        .player-bar .pb-volume button:hover { opacity: 0.7; }
        .player-bar .pb-volume svg { width: 18px; height: 18px; fill: currentColor; }
        .player-bar .pb-volume input[type="range"] { width: 60px; }
        .playlist-item.active-track { border-left-color: var(--accent); background-color: transparent; }
        .playlist-item.active-track:hover { background-color: var(--surface); }
        @media (max-width: 768px) {
            .player-bar { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
            .player-bar .pb-thumb { width: 48px; height: 27px; }
            .player-bar .pb-seek { max-width: none; order: 10; width: 100%; }
            .player-bar .pb-volume input[type="range"] { width: 40px; }
        }
        .timestamp { flex-shrink: 0; width: 128px; font-size: 0.85rem; color: var(--text-secondary); font-family: var(--font-mono); }
        .track-info { flex: 1; margin: 0 16px; }
        .track-title { font-family: var(--font-body); font-size: 1.25rem; font-weight: 500; color: var(--text); margin-bottom: 2px; }
        .artist-name { font-family: var(--font-body); font-size: 1rem; font-weight: 300; color: var(--text-secondary); margin-bottom: 2px; }
        .show-dj-line { font-family: var(--font-body); font-size: 0.9rem; font-weight: 400; color: var(--text-secondary); }
        .dj-name { font-family: var(--font-body); font-weight: 600; }
        .show-name { font-weight: 400; }
        .separator { color: var(--text-secondary); font-weight: 300; }
        .album-covers { display: flex; gap: 8px; flex-shrink: 0; }
        .album-cover-container { width: 80px; height: 80px; background-color: var(--surface); border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .album-cover { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; opacity: 0; transition: opacity 0.2s; }
        .album-cover.loaded { opacity: 1; }
        .origin-story {
            margin-top: 48px; padding: 32px 0;
            color: var(--text-secondary); font-size: 1rem; line-height: 1.7;
        }
        .origin-story h2 {
            font-family: var(--font-title); font-size: 1.4rem; text-transform: uppercase;
            color: var(--text); margin-bottom: 16px;
        }
        .origin-story p { margin-bottom: 12px; }
        .origin-story p:last-child { margin-bottom: 0; }
        .origin-story a { color: var(--accent); text-decoration: none; }
        .origin-story a:hover { text-decoration: underline; }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            .header { flex-direction: column; gap: 15px; }
            h1 { font-size: 2rem; }
            .item-content { flex-wrap: wrap; }
            .track-number { width: 24px; margin-right: 12px; }
            .timestamp { width: 100px; font-size: 0.7rem; }
            .track-info { margin: 0 12px; min-width: 200px; }
            .track-title { font-size: 1rem; }
            .artist-name { font-size: 0.9rem; }
            .show-dj-line { font-size: 0.8rem; }
            .album-covers { gap: 6px; }
            .album-cover-container { width: 56px; height: 56px; }
            .album-cover { width: 56px; height: 56px; }
        }
    </style>
    <script src="https://www.youtube.com/iframe_api"></script>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>KEXP Double Plays</h1>
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
                <svg class="theme-icon sun-icon" style="display:{{SUN_DISPLAY}}" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="m12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
                <svg class="theme-icon moon-icon" style="display:{{MOON_DISPLAY}}" viewBox="0 0 24 24">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            </button>
        </header>
        <div class="status-info">{{STATUS_TEXT}}</div>
        <div class="filter-bar">
            <div class="dj-filters">{{DJ_OPTIONS}}</div>
            <label class="show-mistakes" title="Include {{MISTAKE_COUNT}} entries that may be data errors">
                <input type="checkbox" id="show-all" onchange="applyFilters()"{{SHOW_ALL_CHECKED}}>
                Show mistakes
            </label>
        </div>
        <div id="player-bar" class="player-bar">
            <div class="pb-controls">
                <button onclick="skipPrev()" title="Previous"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button onclick="togglePlay()" id="pb-play-btn" title="Play/Pause" style="position:relative;width:22px;height:22px"><svg viewBox="0 0 24 24" id="pb-play-icon" style="position:absolute;inset:0"><polygon points="5,3 19,12 5,21"/></svg><svg viewBox="0 0 24 24" id="pb-pause-icon" style="position:absolute;inset:0;display:none"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg></button>
                <button onclick="skipNext()" title="Next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
                <button onclick="toggleShuffle()" id="pb-shuffle-btn" title="Shuffle" style="opacity:0.4"><svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg></button>
            </div>
            <div class="pb-seek">
                <span class="pb-time" id="pb-cur">0:00</span>
                <input type="range" id="pb-seek" min="0" max="100" value="0" step="0.1">
                <span class="pb-time" id="pb-dur">0:00</span>
            </div>
            <div class="pb-volume">
                <button onclick="toggleMute()" id="pb-vol-btn" title="Mute"><svg viewBox="0 0 24 24" id="pb-vol-icon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg><svg viewBox="0 0 24 24" id="pb-mute-icon" style="display:none"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg></button>
                <input type="range" id="pb-vol" min="0" max="100" value="100" step="1">
            </div>
            <div class="pb-info">
                <div class="pb-title" id="pb-title">&nbsp;</div>
                <div class="pb-artist" id="pb-artist">&nbsp;</div>
            </div>
            <div class="pb-thumb" id="pb-thumb"></div>
        </div>
        <div id="yt-container" style="position:fixed;width:1px;height:1px;overflow:hidden;visibility:hidden;left:-9999px"><div id="yt-player"></div></div>
        <div class="playlist">{{DOUBLE_PLAYS_HTML}}</div>
        <footer class="origin-story">
            <h2>Origin Story</h2>
            <p>I created this site because I noticed that sometimes when <a href="https://www.kexp.org/djs/john-richards/">John Richards</a> really likes a new song, he plays it twice in a row&mdash;just like a human would, on <a href="https://www.kexp.org">human-powered radio</a>. After catching him do this a few times, I started wondering if you could use the KEXP API to detect double plays automatically.</p>
            <p>This was the first project I built with an AI coding agent. I initially used Cursor to create a TypeScript wrapper around the KEXP API, then later returned to it with <a href="https://claude.ai/claude-code">Claude Code</a>. I deployed the first double play monitor backend in late 2025 but didn't get around to building a frontend until recently.</p>
            <p>The KEXP API only provides about one year of historical data, which means it doesn't include a few of my favorite double plays: <a href="https://www.youtube.com/watch?v=oiRWtw4YmaI">"No Liver, No Lungs"</a> by <a href="https://www.brimheim.com">Brimheim</a> and <a href="https://www.youtube.com/watch?v=vvPCm8cD6kw">"Bend"</a> by <a href="https://www.middlekidsmusic.com">Middle Kids</a>. Perhaps one day the API will go back further and we can hunt for more double plays.</p>
            <p>Consider this a belated birthday gift to John Richards. Feel free to <a href="https://geoffreychallen.com">get in touch</a> if there are remote development opportunities at KEXP.</p>
        </footer>
    </div>
    <script>
        function toggleTheme() {
            var html = document.documentElement;
            var sun = document.querySelector('.sun-icon');
            var moon = document.querySelector('.moon-icon');
            var isDark = html.classList.contains('dark');
            if (isDark) {
                html.classList.remove('dark');
                document.cookie = 'theme=light; path=/; max-age=31536000';
                sun.style.display = 'none'; moon.style.display = 'block';
            } else {
                html.classList.add('dark');
                document.cookie = 'theme=dark; path=/; max-age=31536000';
                sun.style.display = 'block'; moon.style.display = 'none';
            }
        }
        document.querySelectorAll('.timestamp[data-ts]').forEach(function(el) {
            var ts = el.getAttribute('data-ts');
            el.textContent = ts ? new Date(ts).toLocaleString() : 'Never';
        });
        document.querySelectorAll('.album-cover').forEach(function(img) {
            img.onload = function() { img.classList.add('loaded'); };
            img.onerror = function() { img.style.opacity = '0'; };
        });

        /* ── Filters ── */
        function applyFilters() {
            var params = new URLSearchParams();
            var showAll = document.getElementById('show-all').checked;
            var djs = [];
            document.querySelectorAll('.dj-cb:checked').forEach(function(cb) { djs.push(cb.value); });
            if (djs.length > 0) params.set('dj', djs.join(','));
            if (showAll) params.set('show', 'all');
            var qs = params.toString();
            window.location.href = window.location.pathname + (qs ? '?' + qs : '');
        }

        /* ── YouTube Audio Player ── */
        var ytPlayer = null;
        var currentYtId = null;
        var playing = false;
        var duration = 0;
        var draggingSeek = false;
        var timeInterval = null;
        var shuffleOn = false;
        var shuffleOrder = [];
        var shufflePos = 0;

        // Build ordered list of playable tracks
        var tracks = [];
        document.querySelectorAll('.playlist-item[data-yt]').forEach(function(el) {
            tracks.push({
                yt: el.getAttribute('data-yt'),
                title: el.getAttribute('data-title'),
                artist: el.getAttribute('data-artist'),
                album: el.getAttribute('data-album'),
                djShow: el.getAttribute('data-dj-show'),
                el: el
            });
        });

        // Fisher-Yates shuffle
        function generateShuffleOrder() {
            var indices = [];
            for (var i = 0; i < tracks.length; i++) indices.push(i);
            for (var i = indices.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
            }
            return indices;
        }

        function fmtTime(s) {
            s = Math.floor(s);
            var m = Math.floor(s / 60);
            var sec = s % 60;
            return m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        function currentTrackIndex() {
            for (var i = 0; i < tracks.length; i++) {
                if (tracks[i].yt === currentYtId) return i;
            }
            return -1;
        }

        // Get next track index respecting shuffle
        function nextTrackIndex() {
            if (shuffleOn && shuffleOrder.length > 0) {
                var idx = currentTrackIndex();
                var pos = shuffleOrder.indexOf(idx);
                if (pos >= 0 && pos < shuffleOrder.length - 1) return shuffleOrder[pos + 1];
                return -1;
            }
            var idx = currentTrackIndex();
            return (idx >= 0 && idx < tracks.length - 1) ? idx + 1 : -1;
        }

        function prevTrackIndex() {
            if (shuffleOn && shuffleOrder.length > 0) {
                var idx = currentTrackIndex();
                var pos = shuffleOrder.indexOf(idx);
                if (pos > 0) return shuffleOrder[pos - 1];
                return -1;
            }
            var idx = currentTrackIndex();
            return idx > 0 ? idx - 1 : -1;
        }

        function updateBarUI() {
            var bar = document.getElementById('player-bar');
            var idx = currentTrackIndex();
            if (idx < 0) {
                document.getElementById('pb-thumb').style.backgroundImage = '';
                document.getElementById('pb-title').textContent = '\u00a0';
                document.getElementById('pb-artist').textContent = '\u00a0';
                document.getElementById('pb-play-icon').style.display = 'block';
                document.getElementById('pb-pause-icon').style.display = 'none';
                document.querySelectorAll('.playlist-item').forEach(function(el) { el.classList.remove('active-track'); });
                tracks.forEach(function(tr) {
                    var playIco = tr.el.querySelector('.play-icon');
                    var pauseIco = tr.el.querySelector('.pause-icon');
                    if (playIco && pauseIco) { playIco.style.display = 'block'; pauseIco.style.display = 'none'; }
                });
                return;
            }
            var t = tracks[idx];
            document.getElementById('pb-thumb').style.backgroundImage = 'url(https://img.youtube.com/vi/' + t.yt + '/mqdefault.jpg)';
            document.getElementById('pb-title').textContent = t.title;
            document.getElementById('pb-artist').textContent = t.artist + (t.album ? ' \u2014 ' + t.album : '');
            // play/pause icons in bar
            document.getElementById('pb-play-icon').style.display = playing ? 'none' : 'block';
            document.getElementById('pb-pause-icon').style.display = playing ? 'block' : 'none';
            // shuffle button
            document.getElementById('pb-shuffle-btn').style.opacity = shuffleOn ? '1' : '0.4';
            // highlight active track
            document.querySelectorAll('.playlist-item').forEach(function(el) { el.classList.remove('active-track'); });
            t.el.classList.add('active-track');
            // per-track play/pause icons
            tracks.forEach(function(tr) {
                var playIco = tr.el.querySelector('.play-icon');
                var pauseIco = tr.el.querySelector('.pause-icon');
                if (playIco && pauseIco) {
                    if (tr.yt === currentYtId && playing) {
                        playIco.style.display = 'none';
                        pauseIco.style.display = 'block';
                    } else {
                        playIco.style.display = 'block';
                        pauseIco.style.display = 'none';
                    }
                }
            });
        }

        function startTimeUpdates() {
            stopTimeUpdates();
            timeInterval = setInterval(function() {
                if (!ytPlayer || draggingSeek) return;
                var t = ytPlayer.getCurrentTime();
                var d = ytPlayer.getDuration();
                if (d > 0) duration = d;
                document.getElementById('pb-cur').textContent = fmtTime(t);
                document.getElementById('pb-dur').textContent = fmtTime(duration);
                var seek = document.getElementById('pb-seek');
                if (duration > 0) seek.value = (t / duration * 100).toString();
            }, 500);
        }

        function stopTimeUpdates() {
            if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
        }

        function playTrack(ytId) {
            if (!ytPlayer) return;
            if (ytId === currentYtId && playing) {
                ytPlayer.pauseVideo();
                return;
            }
            if (ytId === currentYtId && !playing) {
                ytPlayer.playVideo();
                return;
            }
            currentYtId = ytId;
            duration = 0;
            document.getElementById('pb-cur').textContent = '0:00';
            document.getElementById('pb-dur').textContent = '0:00';
            document.getElementById('pb-seek').value = '0';
            ytPlayer.loadVideoById(ytId);
            updateBarUI();
        }

        function togglePlay() {
            if (!ytPlayer) return;
            if (!currentYtId) {
                if (tracks.length > 0) {
                    if (shuffleOn) {
                        shuffleOrder = generateShuffleOrder();
                        playTrack(tracks[shuffleOrder[0]].yt);
                    } else {
                        playTrack(tracks[0].yt);
                    }
                }
                return;
            }
            if (playing) ytPlayer.pauseVideo();
            else ytPlayer.playVideo();
        }

        function skipNext() {
            var next = nextTrackIndex();
            if (next >= 0) playTrack(tracks[next].yt);
        }

        function skipPrev() {
            var prev = prevTrackIndex();
            if (prev >= 0) playTrack(tracks[prev].yt);
        }

        function toggleShuffle() {
            shuffleOn = !shuffleOn;
            if (shuffleOn) {
                shuffleOrder = generateShuffleOrder();
            }
            document.getElementById('pb-shuffle-btn').style.opacity = shuffleOn ? '1' : '0.4';
        }

        function toggleMute() {
            if (!ytPlayer) return;
            if (ytPlayer.isMuted()) {
                ytPlayer.unMute();
                document.getElementById('pb-vol-icon').style.display = 'block';
                document.getElementById('pb-mute-icon').style.display = 'none';
                document.getElementById('pb-vol').value = ytPlayer.getVolume().toString();
            } else {
                ytPlayer.mute();
                document.getElementById('pb-vol-icon').style.display = 'none';
                document.getElementById('pb-mute-icon').style.display = 'block';
            }
        }

        // Seek slider events
        document.getElementById('pb-seek').addEventListener('input', function() { draggingSeek = true; });
        document.getElementById('pb-seek').addEventListener('change', function() {
            if (ytPlayer && duration > 0) {
                ytPlayer.seekTo(duration * this.value / 100, true);
            }
            draggingSeek = false;
        });

        // Volume slider
        document.getElementById('pb-vol').addEventListener('input', function() {
            if (!ytPlayer) return;
            ytPlayer.setVolume(parseInt(this.value));
            if (parseInt(this.value) > 0 && ytPlayer.isMuted()) {
                ytPlayer.unMute();
                document.getElementById('pb-vol-icon').style.display = 'block';
                document.getElementById('pb-mute-icon').style.display = 'none';
            }
        });

        // Per-track play buttons
        document.querySelectorAll('.play-btn[data-yt]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                playTrack(this.getAttribute('data-yt'));
            });
        });

        // YouTube IFrame API ready callback
        function onYouTubeIframeAPIReady() {
            ytPlayer = new YT.Player('yt-player', {
                height: '1', width: '1',
                playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1 },
                events: {
                    onStateChange: function(event) {
                        if (event.data === YT.PlayerState.PLAYING) {
                            playing = true;
                            var d = ytPlayer.getDuration();
                            if (d > 0) duration = d;
                            startTimeUpdates();
                            updateBarUI();
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            playing = false;
                            stopTimeUpdates();
                            updateBarUI();
                        } else if (event.data === YT.PlayerState.ENDED) {
                            playing = false;
                            stopTimeUpdates();
                            // Auto-advance (respects shuffle)
                            var next = nextTrackIndex();
                            if (next >= 0) {
                                playTrack(tracks[next].yt);
                            } else {
                                currentYtId = null;
                                updateBarUI();
                            }
                        } else if (event.data === YT.PlayerState.BUFFERING || event.data === 5) {
                            playing = true;
                            updateBarUI();
                        }
                    }
                }
            });
        }
    </script>
</body>
</html>`;
