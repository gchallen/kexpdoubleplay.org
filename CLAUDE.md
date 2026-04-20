# CLAUDE.md - Project Instructions for KEXP Double Play Scanner

## Project Overview
Cloudflare Worker that detects and displays KEXP radio double plays (consecutive plays of the same song). Single deployment handles frontend SSR, REST API, and scheduled scanning.

### Workspace Structure
- **`types/`**: Shared TypeScript types and Zod schemas
- **`worker/`**: Cloudflare Worker — scanner, API, and frontend

## Key Technologies
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Language**: TypeScript 5.x
- **Notifications**: ntfy.sh push notifications
- **Frontend**: Vanilla JS with YouTube IFrame API audio player (SSR from Worker)

## Architecture

### Worker Entry Points
- **`fetch`**: HTTP handler — serves frontend at `/`, API at `/api/*`
- **`scheduled`**: Cron trigger (every 5 minutes) — scans KEXP API for new double plays

### Core Modules
- `index.ts`: Entry point, cron scan logic
- `api-handler.ts`: REST API endpoints
- `frontend.ts`: SSR HTML template with YouTube player, filters
- `detector.ts`: Double play detection algorithm
- `kexp-api.ts`: KEXP API client with retry logic
- `notify.ts`: ntfy.sh push notifications
- `db.ts`: D1 database utilities
- `types.ts`: Env interface

### Key Patterns
- **Incremental scanning**: Tracks `startTime`/`endTime` in `scan_state` table
- **Overlap**: 15-minute overlap on each scan to catch plays spanning scan boundaries
- **Classification**: Auto-classifies plays as `legitimate`, `partial`, or `mistake`
- **Server-side filtering**: URL query params (`?dj=Name&show=all`) filter on the server for shareable links

## Development

### Package Management
- **Use `bun`** (never npm/yarn)
- **Pin all dependencies** to exact versions (no `^` or `~`)

### Common Commands
```bash
bun install              # Install all workspaces
bun run dev              # Local dev server (wrangler dev)
bun run deploy           # Build types + deploy worker + send ntfy notification
bun run check            # TypeScript check
cd worker && bun run tail # Stream live logs
```

In development, the site is served at **`http://kexpdoubleplays.local`** (reverse-proxied to wrangler dev). Use that hostname — not `localhost:8788` — when fetching or testing the local site.

### Configuration
Environment variables in `worker/wrangler.toml`:
- `NTFY_TOPIC`: ntfy.sh topic for push notifications
- `KEXP_API_BASE_URL`: KEXP API base URL

Secrets (set via `wrangler secret put`):
- `ADMIN_TOKEN`: Bearer token for write API endpoints

### Database
D1 database `kexpdoubleplays` with two tables:
- `double_plays`: Detected double plays with artist, title, DJ, show, classification, youtube_id, plays JSON
- `scan_state`: Singleton row tracking scan cursor and statistics

Migrations in `worker/migrations/`.

### REST API Endpoints
- `GET /api/health`: System status
- `GET /api/double-plays`: All double plays
- `GET /api/double-plays/paginated`: Paginated access
- `GET /api/stats`: Artist/DJ/show statistics

### Frontend Features
- YouTube IFrame API audio player with sticky player bar
- Per-track play/pause buttons with auto-advance
- DJ dropdown filter and classification toggle
- URL query params for shareable filtered views
- Dark mode support

### Notifications (ntfy.sh)
- **New double play**: Artist, title, DJ, show, YouTube link
- **Deploy**: Sent after successful `bun run deploy`
- **Scan warning**: If scan wall time exceeds 2 minutes

## Testing
- Known test data: Pulp "Spike Island" double play on 2025-04-10 (play IDs 3487084, 3487086)

## Deployment
- **Domain**: `kexpdoubleplays.org` (DNS on Cloudflare)
- **Deploy**: `bun run deploy` (from root or `cd worker && bun run deploy`)
- **Cron**: `*/5 * * * *` scans KEXP API every 5 minutes

## Important Notes
- All timestamps are ISO 8601 UTC
- KEXP API rate limiting respected (1000ms default delay)
- Double plays are rare — the D1 database won't grow large
- Cloudflare Workers free plan: 10ms CPU for HTTP, 30s CPU for cron (wall time can be much longer due to I/O waits)
