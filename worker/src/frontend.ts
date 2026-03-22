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
  const djFilter = url.searchParams.get("dj") || "";

  // Collect unique DJs for the dropdown
  const djSet = new Set<string>();
  for (const dp of allPlays) {
    if (dp.dj) djSet.add(dp.dj);
  }
  const djList = [...djSet].sort((a, b) => a.localeCompare(b));

  // Apply filters
  let doublePlays = allPlays;
  if (!showAll) {
    doublePlays = doublePlays.filter((dp) => dp.classification !== "mistake");
  }
  if (djFilter) {
    doublePlays = doublePlays.filter((dp) => dp.dj === djFilter);
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
  const filterDesc = djFilter ? ` by ${djFilter}` : "";
  const statusText = `Showing ${doublePlays.length} of ${totalCount} double plays${filterDesc}${mistakeCount > 0 && showAll ? ` (includes ${mistakeCount} mistakes)` : ""}${ytCount > 0 ? ` &bull; ${ytCount} with YouTube` : ""} &bull; Last updated: <span class="timestamp" data-ts="${lastFetch || ""}"></span>`;

  // Build DJ options
  const djOptions = djList
    .map((dj) => `<option value="${escAttr(dj)}"${dj === djFilter ? " selected" : ""}>${escAttr(dj)}</option>`)
    .join("");

  const items = doublePlays.map((dp, i) => renderItem(dp, i)).join("");

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

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderItem(dp: DoublePlay, i: number): string {
  const first = dp.plays[0];

  const playBtn = dp.youtube_id
    ? `<div class="play-button">
         <button class="play-btn" data-yt="${dp.youtube_id}" title="Play">
           <svg viewBox="0 0 24 24" class="play-icon"><polygon class="fill-black" points="5,3 19,12 5,21"></polygon></svg>
           <svg viewBox="0 0 24 24" class="pause-icon" style="display:none"><rect class="fill-black" x="5" y="3" width="4" height="18"></rect><rect class="fill-black" x="15" y="3" width="4" height="18"></rect></svg>
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

  return `<div class="playlist-item"${ytAttr} data-title="${escAttr(dp.title)}" data-artist="${escAttr(dp.artist)}" data-dj-show="${escAttr(djShow)}">
  <div class="item-content">
    <div class="track-number">${i + 1}</div>
    ${playBtn}
    <div class="timestamp" data-ts="${first.timestamp}"></div>
    <div class="track-info">
      <div class="track-line">
        <span class="track-title">${dp.title}</span>
        <span class="artist-name">by ${dp.artist}</span>
        ${first.kexpPlay.album ? `<span class="release-year">(${first.kexpPlay.album})</span>` : ""}
      </div>
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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6; background-color: white; color: black;
            transition: background-color 0.2s, color 0.2s;
        }
        .dark body { background-color: #111; color: white; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e5e5e5;
        }
        .dark .header { border-bottom-color: #333; }
        h1 { font-size: 2.5rem; font-weight: 300; color: black; }
        .dark h1 { color: white; }
        .theme-toggle {
            background: none; border: 1px solid #ddd; padding: 8px; border-radius: 4px;
            cursor: pointer; color: inherit; transition: border-color 0.2s, background-color 0.2s;
            display: flex; align-items: center; justify-content: center;
        }
        .theme-toggle:hover { background-color: #f5f5f5; border-color: #ccc; }
        .dark .theme-toggle { border-color: #555; }
        .dark .theme-toggle:hover { background-color: #222; border-color: #666; }
        .theme-icon { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .status-info { margin-bottom: 12px; font-size: 0.9rem; color: #666; }
        .dark .status-info { color: #aaa; }
        .filter-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-bar label { font-size: 0.85rem; color: #555; display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .dark .filter-bar label { color: #bbb; }
        .filter-bar select {
            font-size: 0.85rem; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
            background: white; color: inherit; cursor: pointer;
        }
        .dark .filter-bar select { background: #222; border-color: #444; color: #ddd; }
        .filter-bar input[type="checkbox"] { cursor: pointer; }
        .playlist-item { padding: 20px; border-bottom: 1px solid #f0f0f0; transition: background-color 0.2s; }
        .playlist-item:hover { background-color: #fafafa; }
        .dark .playlist-item { border-bottom-color: #222; }
        .dark .playlist-item:hover { background-color: #1a1a1a; }
        .item-content { display: flex; align-items: center; width: 100%; }
        .track-number { flex-shrink: 0; margin-right: 16px; width: 32px; text-align: right; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace; font-size: 0.875rem; color: #666; }
        .dark .track-number { color: #aaa; }
        .play-button { flex-shrink: 0; margin-right: 12px; width: 32px; height: 32px; }
        .play-button button { display: block; background: none; border: none; padding: 0; cursor: pointer; transition: opacity 0.2s; }
        .play-button button:hover { opacity: 0.8; }
        .play-button.invisible { visibility: hidden; }
        .play-button svg { width: 32px; height: 32px; }
        .play-button .fill-black { fill: black; }
        .dark .play-button .fill-black { fill: white; }

        /* Player bar */
        .player-bar {
            position: sticky; top: 0; z-index: 100;
            background: #f8f8f8; border-bottom: 1px solid #e0e0e0;
            padding: 8px 20px; display: flex; align-items: center; gap: 12px;
        }
        .dark .player-bar { background: #1a1a1a; border-bottom-color: #333; }
        .player-bar .pb-thumb { width: 60px; height: 34px; object-fit: cover; border-radius: 3px; flex-shrink: 0; background: #ddd; }
        .dark .player-bar .pb-thumb { background: #333; }
        .player-bar .pb-info { flex: 1; min-width: 0; overflow: hidden; }
        .player-bar .pb-title { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-bar .pb-artist { font-size: 0.75rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dark .player-bar .pb-artist { color: #aaa; }
        .player-bar .pb-controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .player-bar .pb-controls button {
            background: none; border: none; cursor: pointer; padding: 4px;
            color: inherit; display: flex; align-items: center; justify-content: center;
        }
        .player-bar .pb-controls button:hover { opacity: 0.7; }
        .player-bar .pb-controls svg { width: 22px; height: 22px; fill: currentColor; }
        .player-bar .pb-seek { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 360px; min-width: 120px; }
        .player-bar .pb-time { font-size: 0.7rem; color: #666; font-family: 'SF Mono', Monaco, monospace; white-space: nowrap; min-width: 32px; }
        .dark .player-bar .pb-time { color: #aaa; }
        .player-bar input[type="range"] {
            -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
            background: #ccc; border-radius: 2px; outline: none; cursor: pointer;
        }
        .dark .player-bar input[type="range"] { background: #444; }
        .player-bar input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px;
            border-radius: 50%; background: #333; cursor: pointer;
        }
        .dark .player-bar input[type="range"]::-webkit-slider-thumb { background: #ddd; }
        .player-bar .pb-volume { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .player-bar .pb-volume button { background: none; border: none; cursor: pointer; padding: 2px; color: inherit; display: flex; }
        .player-bar .pb-volume button:hover { opacity: 0.7; }
        .player-bar .pb-volume svg { width: 18px; height: 18px; fill: currentColor; }
        .player-bar .pb-volume input[type="range"] { width: 60px; }
        .playlist-item.active-track { background-color: #f0f4ff; }
        .dark .playlist-item.active-track { background-color: #1a2233; }
        @media (max-width: 768px) {
            .player-bar { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
            .player-bar .pb-thumb { width: 48px; height: 27px; }
            .player-bar .pb-seek { max-width: none; order: 10; width: 100%; }
            .player-bar .pb-volume input[type="range"] { width: 40px; }
        }
        .timestamp { flex-shrink: 0; width: 128px; font-size: 0.75rem; color: #666; }
        .dark .timestamp { color: #aaa; }
        .track-info { flex: 1; margin: 0 16px; }
        .track-line { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
        .track-title { font-size: 1.1rem; font-weight: 400; color: black; }
        .dark .track-title { color: white; }
        .artist-name { font-size: 1.1rem; font-weight: 300; color: #555; }
        .dark .artist-name { color: #ccc; }
        .release-year { font-size: 0.875rem; font-style: italic; color: #666; text-transform: none; }
        .dark .release-year { color: #aaa; }
        .show-dj-line { font-size: 0.9rem; font-weight: 400; color: #333; }
        .dark .show-dj-line { color: #ddd; }
        .dj-name { font-weight: 600; }
        .show-name { font-weight: 400; }
        .separator { color: #999; font-weight: 300; }
        .album-covers { display: flex; gap: 8px; flex-shrink: 0; }
        .album-cover-container { width: 64px; height: 64px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; }
        .dark .album-cover-container { background-color: #2a2a2a; }
        .album-cover { width: 64px; height: 64px; object-fit: cover; opacity: 0; transition: opacity 0.2s; }
        .album-cover.loaded { opacity: 1; }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            .header { flex-direction: column; gap: 15px; }
            h1 { font-size: 2rem; }
            .item-content { flex-wrap: wrap; }
            .track-number { width: 24px; margin-right: 12px; }
            .timestamp { width: 100px; font-size: 0.7rem; }
            .track-info { margin: 0 12px; min-width: 200px; }
            .track-line { gap: 6px; margin-bottom: 4px; }
            .track-title { font-size: 1rem; }
            .artist-name { font-size: 1rem; }
            .release-year { font-size: 0.8rem; }
            .show-dj-line { font-size: 0.85rem; gap: 6px; }
            .album-covers { gap: 6px; }
            .album-cover-container { width: 48px; height: 48px; }
            .album-cover { width: 48px; height: 48px; }
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
            <label>
                <select id="dj-filter" onchange="applyFilters()">
                    <option value="">All DJs</option>
                    {{DJ_OPTIONS}}
                </select>
            </label>
            <label title="Include {{MISTAKE_COUNT}} entries that may be data errors">
                <input type="checkbox" id="show-all" onchange="applyFilters()"{{SHOW_ALL_CHECKED}}>
                Show mistakes
            </label>
        </div>
        <div id="player-bar" class="player-bar">
            <img class="pb-thumb" id="pb-thumb" src="" alt="" style="visibility:hidden">
            <div class="pb-info">
                <div class="pb-title" id="pb-title">Select a track to play</div>
                <div class="pb-artist" id="pb-artist"></div>
            </div>
            <div class="pb-controls">
                <button onclick="skipPrev()" title="Previous"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button onclick="togglePlay()" id="pb-play-btn" title="Play/Pause"><svg viewBox="0 0 24 24"><polygon id="pb-play-icon" points="5,3 19,12 5,21"/></svg><svg viewBox="0 0 24 24" id="pb-pause-icon" style="display:none"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg></button>
                <button onclick="skipNext()" title="Next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
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
        </div>
        <div id="yt-container" style="position:fixed;width:1px;height:1px;overflow:hidden;visibility:hidden;left:-9999px"><div id="yt-player"></div></div>
        <div class="playlist">{{DOUBLE_PLAYS_HTML}}</div>
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
            var dj = document.getElementById('dj-filter').value;
            var showAll = document.getElementById('show-all').checked;
            if (dj) params.set('dj', dj);
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

        // Build ordered list of playable tracks
        var tracks = [];
        document.querySelectorAll('.playlist-item[data-yt]').forEach(function(el) {
            tracks.push({
                yt: el.getAttribute('data-yt'),
                title: el.getAttribute('data-title'),
                artist: el.getAttribute('data-artist'),
                djShow: el.getAttribute('data-dj-show'),
                el: el
            });
        });

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

        function updateBarUI() {
            var bar = document.getElementById('player-bar');
            var idx = currentTrackIndex();
            if (idx < 0) {
                document.getElementById('pb-thumb').style.visibility = 'hidden';
                document.getElementById('pb-title').textContent = 'Select a track to play';
                document.getElementById('pb-artist').textContent = '';
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
            document.getElementById('pb-thumb').style.visibility = 'visible';
            document.getElementById('pb-thumb').src = 'https://img.youtube.com/vi/' + t.yt + '/mqdefault.jpg';
            document.getElementById('pb-title').textContent = t.title;
            document.getElementById('pb-artist').textContent = t.artist + (t.djShow ? ' \\u2022 ' + t.djShow : '');
            // play/pause icons in bar
            document.getElementById('pb-play-icon').style.display = playing ? 'none' : 'block';
            document.getElementById('pb-pause-icon').style.display = playing ? 'block' : 'none';
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
            if (!ytPlayer || !currentYtId) return;
            if (playing) ytPlayer.pauseVideo();
            else ytPlayer.playVideo();
        }

        function skipNext() {
            var idx = currentTrackIndex();
            if (idx < 0 || idx >= tracks.length - 1) return;
            playTrack(tracks[idx + 1].yt);
        }

        function skipPrev() {
            var idx = currentTrackIndex();
            if (idx <= 0) return;
            playTrack(tracks[idx - 1].yt);
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
                            // Auto-advance
                            var idx = currentTrackIndex();
                            if (idx >= 0 && idx < tracks.length - 1) {
                                playTrack(tracks[idx + 1].yt);
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
