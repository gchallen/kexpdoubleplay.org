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
  const djParam = url.searchParams.get("dj") || "";
  const selectedDJs = new Set(djParam ? djParam.split(",") : []);

  // Count plays per DJ (excluding mistakes)
  const djCounts = new Map<string, number>();
  for (const dp of allPlays) {
    if (!dp.dj) continue;
    if (dp.classification === "mistake") continue;
    djCounts.set(dp.dj, (djCounts.get(dp.dj) || 0) + 1);
  }
  // Only DJs with >1 double play, sorted by count desc then name
  const djList = [...djCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Apply filters — exclude mistakes and unmapped tracks (youtube_id === "")
  // New tracks (youtube_id undefined/null) are shown; mapped tracks are shown; unmapped ("") are hidden
  let doublePlays = allPlays.filter((dp) => dp.youtube_id !== "" && dp.classification !== "mistake");
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

  const statusText = `Last updated: <span class="timestamp" data-ts="${lastFetch || ""}"></span>`;

  // Build DJ checkboxes
  const djOptions = djList
    .map(([dj, count]) => {
      const checked = selectedDJs.has(dj) ? " checked" : "";
      return `<label class="dj-chip"><input type="checkbox" class="dj-cb" value="${escAttr(dj)}" onchange="applyFilters()"${checked}><span>${escAttr(dj)} (${count})</span></label>`;
    })
    .join("");

  const items = doublePlays.map((dp, i) => renderItem(dp, doublePlays.length - i)).join("");

  // Build YouTube playlist URL from mapped tracks (limit 50)
  const ytIds = doublePlays.filter((dp) => dp.youtube_id).slice(0, 50).map((dp) => dp.youtube_id);
  const ytPlaylistUrl = ytIds.length > 0
    ? `https://www.youtube.com/watch_videos?video_ids=${ytIds.join(",")}`
    : "";

  const html = TEMPLATE.replace("{{THEME_CLASS}}", themeClass)
    .replace("{{SUN_DISPLAY}}", sunDisplay)
    .replace("{{MOON_DISPLAY}}", moonDisplay)
    .replace("{{STATUS_TEXT}}", statusText)
    .replace("{{DJ_OPTIONS}}", djOptions)
    .replace("{{YT_PLAYLIST_URL}}", ytPlaylistUrl)
    .replace("{{DOUBLE_PLAYS_HTML}}", items);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
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
  const newClass = dp.youtube_id ? "" : " new-track";
  const newBadge = dp.youtube_id ? "" : `<span class="new-badge">New</span>`;

  return `<div class="playlist-item${newClass}"${ytAttr} data-title="${escAttr(dp.title)}" data-artist="${escAttr(dp.artist)}" data-album="${escAttr(album)}" data-dj-show="${escAttr(djShow)}">
  <div class="item-content">
    <div class="track-number">${i}</div>
    ${playBtn}
    <div class="timestamp" data-ts="${first.timestamp}"></div>
    <div class="track-info">
      <div class="track-title">${dp.title}${newBadge}</div>
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
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='4,4 18,16 4,28' fill='%23fbad18' opacity='0.5'/%3E%3Cpolygon points='12,4 26,16 12,28' fill='%23fbad18'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@300;400;500;600&display=swap" rel="stylesheet">
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
            --font-title: sans-serif;
            --font-mono: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
        }
        .dark {
            --bg: #141414;
            --text: #c8c8c3;
            --text-title: #b0b0ab;
            --text-secondary: #8a8a85;
            --border: #2a2825;
            --surface: #1e1d1b;
            --accent: #d49515;
            --accent-dim: #d4951520;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--font-body);
            line-height: 1.6; background-color: var(--bg); color: var(--text);
            transition: background-color 0.2s, color 0.2s;
        }
        .container { max-width: 860px; margin: 0 auto; padding: 20px; }
        .header {
            margin-bottom: 0;
        }
        h1 { line-height: 1; }
        .title-svg {
            height: 2.8rem; width: auto;
            transform: scaleY(-1);
        }
        .title-main { fill: var(--text-title, var(--text)); }
        .title-shadow { fill: var(--accent); }
        .top-actions {
            position: fixed; top: 16px; right: 16px; z-index: 200;
            display: flex; align-items: center; gap: 8px;
        }
        .feed-btn {
            background: var(--bg); border: 1px solid var(--border); padding: 8px; border-radius: 4px;
            color: var(--text-secondary); display: flex; align-items: center; justify-content: center;
            transition: border-color 0.2s, background-color 0.2s, color 0.2s; text-decoration: none;
        }
        .feed-btn:hover { background-color: var(--surface); border-color: var(--text-secondary); color: var(--accent); }
        .theme-toggle {
            background: var(--bg); border: 1px solid var(--border); padding: 8px; border-radius: 4px;
            cursor: pointer; color: inherit; transition: border-color 0.2s, background-color 0.2s;
            display: flex; align-items: center; justify-content: center;
        }
        .theme-toggle:hover { background-color: var(--surface); border-color: var(--text-secondary); }
        .tagline { font-size: 1.3rem; color: var(--text-secondary); margin-top: 8px; margin-bottom: 16px; }
        .tagline a { color: var(--accent); text-decoration: none; }
        .tagline a:hover { text-decoration: underline; }
        .theme-icon { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .status-info { margin-bottom: 12px; font-size: 0.85rem; color: var(--text-secondary); text-align: right; }
        .status-info .timestamp { font-family: var(--font-body); font-size: inherit; width: auto; }
        .filter-bar { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
        .dj-filters { display: flex; flex-wrap: wrap; gap: 6px; }
        .dj-chip { display: flex; align-items: center; gap: 4px; font-size: 0.9rem; color: var(--text-secondary);
            padding: 2px 8px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
            transition: background-color 0.15s, border-color 0.15s; }
        .dj-chip:hover { background: var(--surface); }
        .dj-chip:has(input:checked) { background: var(--accent-dim); border-color: var(--accent); color: var(--text); }
        .dj-chip input[type="checkbox"] { cursor: pointer; accent-color: var(--accent); }
        .yt-playlist-btn {
            display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-body);
            font-size: 0.85rem; color: var(--text-secondary); text-decoration: none;
            padding: 4px 10px; border: 1px solid var(--border); border-radius: 12px;
            transition: background-color 0.15s, border-color 0.15s, color 0.15s; white-space: nowrap;
        }
        .yt-playlist-btn:hover { background: var(--surface); border-color: var(--text-secondary); color: var(--text); }
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
        .playlist-item.new-track { opacity: 0.65; }
        .new-badge {
            display: inline-block; font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.05em; color: var(--accent); background: var(--accent-dim);
            padding: 1px 6px; border-radius: 3px; margin-left: 8px; vertical-align: middle;
        }
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
            margin-top: 24px; padding: 24px 0;
            color: var(--text-secondary); font-size: 1rem; line-height: 1.7;
        }
        .origin-story h2 {
            font-family: var(--font-body); font-size: 1.2rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.05em; color: var(--text); margin-bottom: 16px;
        }
        .origin-story p { margin-bottom: 12px; }
        .origin-story p:last-child { margin-bottom: 0; }
        .origin-story a { color: var(--accent); text-decoration: none; }
        .origin-story a:hover { text-decoration: underline; }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            h1 .title-svg { height: 2rem; }
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
    <link rel="alternate" type="application/rss+xml" title="KEXP Double Plays (RSS)" href="/feed.xml">
    <link rel="alternate" type="application/atom+xml" title="KEXP Double Plays (Atom)" href="/feed.atom">
    <script src="https://www.youtube.com/iframe_api"></script>
</head>
<body>
    <div class="container">
        <div class="top-actions">
            <a class="feed-btn" href="/feed.xml" title="RSS Feed"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z"/></svg></a>
            <a class="feed-btn" href="/feed.atom" title="Atom Feed"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(90 12 12)"/></svg></a>
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
                <svg class="theme-icon sun-icon" style="display:{{SUN_DISPLAY}}" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="m12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
                <svg class="theme-icon moon-icon" style="display:{{MOON_DISPLAY}}" viewBox="0 0 24 24">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            </button>
        </div>
        <header class="header">
            <h1><svg class="title-svg" viewBox="0 0 6205 1050" aria-label="KEXP Double Plays"><g class="title-shadow" transform="translate(100,50)"><path transform="translate(0,0)" d="M41 700H151V405L291 700H401L270 443L403 0H288L195 312L151 223V0H41Z"/><path transform="translate(414,0)" d="M41 700H341V600H151V415H302V315H151V100H341V0H41Z"/><path transform="translate(777,0)" d="M138 358 17 700H133L207 474H209L285 700H389L268 358L395 0H279L199 244H197L115 0H11Z"/><path transform="translate(1183,0)" d="M41 700H203Q285 700 326.0 656.0Q367 612 367 527V458Q367 373 326.0 329.0Q285 285 203 285H151V0H41ZM203 385Q230 385 243.5 400.0Q257 415 257 451V534Q257 570 243.5 585.0Q230 600 203 600H151V385Z"/><path transform="translate(1729,0)" d="M41 700H209Q291 700 332.0 656.0Q373 612 373 527V173Q373 88 332.0 44.0Q291 0 209 0H41ZM207 100Q234 100 248.5 116.0Q263 132 263 168V532Q263 568 248.5 584.0Q234 600 207 600H151V100Z"/><path transform="translate(2135,0)" d="M33 166V534Q33 618 76.0 664.0Q119 710 200 710Q281 710 324.0 664.0Q367 618 367 534V166Q367 82 324.0 36.0Q281 -10 200 -10Q119 -10 76.0 36.0Q33 82 33 166ZM257 159V541Q257 610 200 610Q143 610 143 541V159Q143 90 200 90Q257 90 257 159Z"/><path transform="translate(2535,0)" d="M37 166V700H147V158Q147 122 161.5 106.0Q176 90 203 90Q230 90 244.5 106.0Q259 122 259 158V700H365V166Q365 81 323.0 35.5Q281 -10 201 -10Q121 -10 79.0 35.5Q37 81 37 166Z"/><path transform="translate(2937,0)" d="M41 700H207Q292 700 331.0 660.5Q370 621 370 539V511Q370 457 352.5 423.0Q335 389 299 374V372Q381 344 381 226V166Q381 85 338.5 42.5Q296 0 214 0H41ZM194 415Q227 415 243.5 432.0Q260 449 260 489V528Q260 566 246.5 583.0Q233 600 204 600H151V415ZM214 100Q243 100 257.0 115.5Q271 131 271 169V230Q271 278 254.5 296.5Q238 315 200 315H151V100Z"/><path transform="translate(3341,0)" d="M41 700H151V100H332V0H41Z"/><path transform="translate(3685,0)" d="M41 700H341V600H151V415H302V315H151V100H341V0H41Z"/><path transform="translate(4208,0)" d="M41 700H203Q285 700 326.0 656.0Q367 612 367 527V458Q367 373 326.0 329.0Q285 285 203 285H151V0H41ZM203 385Q230 385 243.5 400.0Q257 415 257 451V534Q257 570 243.5 585.0Q230 600 203 600H151V385Z"/><path transform="translate(4594,0)" d="M41 700H151V100H332V0H41Z"/><path transform="translate(4938,0)" d="M126 700H275L389 0H279L259 139V137H134L114 0H12ZM246 232 197 578H195L147 232Z"/><path transform="translate(5339,0)" d="M142 298 9 700H126L201 443H203L278 700H385L252 298V0H142Z"/><path transform="translate(5733,0)" d="M22 166V206H126V158Q126 90 183 90Q211 90 225.5 106.5Q240 123 240 160Q240 204 220.0 237.5Q200 271 146 318Q78 378 51.0 426.5Q24 475 24 536Q24 619 66.0 664.5Q108 710 188 710Q267 710 307.5 664.5Q348 619 348 534V505H244V541Q244 577 230.0 593.5Q216 610 189 610Q134 610 134 543Q134 505 154.5 472.0Q175 439 229 392Q298 332 324.0 283.0Q350 234 350 168Q350 82 307.5 36.0Q265 -10 184 -10Q104 -10 63.0 35.5Q22 81 22 166Z"/></g><g class="title-main" transform="translate(0,0)"><path transform="translate(0,0)" d="M41 700H151V405L291 700H401L270 443L403 0H288L195 312L151 223V0H41Z"/><path transform="translate(414,0)" d="M41 700H341V600H151V415H302V315H151V100H341V0H41Z"/><path transform="translate(777,0)" d="M138 358 17 700H133L207 474H209L285 700H389L268 358L395 0H279L199 244H197L115 0H11Z"/><path transform="translate(1183,0)" d="M41 700H203Q285 700 326.0 656.0Q367 612 367 527V458Q367 373 326.0 329.0Q285 285 203 285H151V0H41ZM203 385Q230 385 243.5 400.0Q257 415 257 451V534Q257 570 243.5 585.0Q230 600 203 600H151V385Z"/><path transform="translate(1729,0)" d="M41 700H209Q291 700 332.0 656.0Q373 612 373 527V173Q373 88 332.0 44.0Q291 0 209 0H41ZM207 100Q234 100 248.5 116.0Q263 132 263 168V532Q263 568 248.5 584.0Q234 600 207 600H151V100Z"/><path transform="translate(2135,0)" d="M33 166V534Q33 618 76.0 664.0Q119 710 200 710Q281 710 324.0 664.0Q367 618 367 534V166Q367 82 324.0 36.0Q281 -10 200 -10Q119 -10 76.0 36.0Q33 82 33 166ZM257 159V541Q257 610 200 610Q143 610 143 541V159Q143 90 200 90Q257 90 257 159Z"/><path transform="translate(2535,0)" d="M37 166V700H147V158Q147 122 161.5 106.0Q176 90 203 90Q230 90 244.5 106.0Q259 122 259 158V700H365V166Q365 81 323.0 35.5Q281 -10 201 -10Q121 -10 79.0 35.5Q37 81 37 166Z"/><path transform="translate(2937,0)" d="M41 700H207Q292 700 331.0 660.5Q370 621 370 539V511Q370 457 352.5 423.0Q335 389 299 374V372Q381 344 381 226V166Q381 85 338.5 42.5Q296 0 214 0H41ZM194 415Q227 415 243.5 432.0Q260 449 260 489V528Q260 566 246.5 583.0Q233 600 204 600H151V415ZM214 100Q243 100 257.0 115.5Q271 131 271 169V230Q271 278 254.5 296.5Q238 315 200 315H151V100Z"/><path transform="translate(3341,0)" d="M41 700H151V100H332V0H41Z"/><path transform="translate(3685,0)" d="M41 700H341V600H151V415H302V315H151V100H341V0H41Z"/><path transform="translate(4208,0)" d="M41 700H203Q285 700 326.0 656.0Q367 612 367 527V458Q367 373 326.0 329.0Q285 285 203 285H151V0H41ZM203 385Q230 385 243.5 400.0Q257 415 257 451V534Q257 570 243.5 585.0Q230 600 203 600H151V385Z"/><path transform="translate(4594,0)" d="M41 700H151V100H332V0H41Z"/><path transform="translate(4938,0)" d="M126 700H275L389 0H279L259 139V137H134L114 0H12ZM246 232 197 578H195L147 232Z"/><path transform="translate(5339,0)" d="M142 298 9 700H126L201 443H203L278 700H385L252 298V0H142Z"/><path transform="translate(5733,0)" d="M22 166V206H126V158Q126 90 183 90Q211 90 225.5 106.5Q240 123 240 160Q240 204 220.0 237.5Q200 271 146 318Q78 378 51.0 426.5Q24 475 24 536Q24 619 66.0 664.5Q108 710 188 710Q267 710 307.5 664.5Q348 619 348 534V505H244V541Q244 577 230.0 593.5Q216 610 189 610Q134 610 134 543Q134 505 154.5 472.0Q175 439 229 392Q298 332 324.0 283.0Q350 234 350 168Q350 82 307.5 36.0Q265 -10 184 -10Q104 -10 63.0 35.5Q22 81 22 166Z"/></g></svg></h1>
            <p class="tagline">Sometimes when a <a href="https://www.kexp.org" target="_blank">KEXP</a> DJ likes a new song, they play it twice. <a href="#origin">Read more&hellip;</a></p>
        </header>
        <div class="filter-bar">
            <div class="dj-filters">{{DJ_OPTIONS}}</div>
            <a class="yt-playlist-btn" href="{{YT_PLAYLIST_URL}}" target="_blank" title="Open playlist in YouTube"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/></svg> Open on YouTube</a>
        </div>
        <div class="status-info">{{STATUS_TEXT}}</div>
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
        <footer class="origin-story" id="origin">
            <h2>Origin Story</h2>
            <p>I created this site because I noticed that sometimes when <a href="https://www.kexp.org" target="_blank">KEXP</a> DJ <a href="https://www.kexp.org/djs/john-richards/" target="_blank">John Richards</a> really likes a new song, he plays it twice in a row&mdash;just like a human would, on human-powered radio. After catching him do this a few times, I started wondering if you could use the <a href="https://api.kexp.org/v2/" target="_blank">KEXP API</a> to detect double plays automatically.</p>
            <p>This was the first project I built with an AI coding agent. I initially used Cursor to create a TypeScript wrapper around the <a href="https://api.kexp.org/v2/" target="_blank">KEXP API</a>, then later returned to it with <a href="https://claude.ai/claude-code" target="_blank">Claude Code</a>. I deployed the first double play monitor backend in late 2025 but didn't get around to building a frontend until recently.</p>
            <p>The <a href="https://api.kexp.org/v2/" target="_blank">KEXP API</a> only provides about one year of historical data, which means it doesn't include a few of my favorite double plays: <a href="https://www.youtube.com/watch?v=oiRWtw4YmaI" target="_blank">"No Liver, No Lungs"</a> by <a href="https://www.brimheim.com" target="_blank">Brimheim</a> and <a href="https://www.youtube.com/watch?v=vvPCm8cD6kw" target="_blank">"Bend"</a> by <a href="https://www.middlekidsmusic.com" target="_blank">Middle Kids</a>. Perhaps one day the API will go back further and we can hunt for more double plays.</p>
            <p>Due to the limitations of existing music service APIs, curation of this playlist is a manual process. If you see a double play above that doesn't have a track yet, please be patient. I'll get to it soon.</p>
            <p>Consider this a belated birthday gift to John Richards. Feel free to <a href="https://geoffreychallen.com" target="_blank">get in touch</a> if there are remote development opportunities at KEXP.</p>
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
            var djs = [];
            document.querySelectorAll('.dj-cb:checked').forEach(function(cb) { djs.push(cb.value); });
            if (djs.length > 0) params.set('dj', djs.join(','));
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
