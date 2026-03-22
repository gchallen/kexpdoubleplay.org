# KEXP Double Play Scanner

Detects and displays double plays from [KEXP](https://kexp.org) radio station playlist data. A double play is when a DJ plays the same song twice in a row.

**Live at [kexpdoubleplays.org](https://kexpdoubleplays.org)**

## Architecture

Cloudflare Worker handling everything in a single deployment:
- **Frontend**: Server-side rendered HTML with YouTube audio player, DJ/classification filters
- **API**: REST endpoints for double play data and statistics
- **Scanner**: Cron trigger (every 5 minutes) polling the KEXP API for new plays
- **Database**: Cloudflare D1 (SQLite)
- **Notifications**: ntfy.sh push notifications for new double plays

### Workspaces
- `types/` — Shared TypeScript types and Zod schemas
- `worker/` — Cloudflare Worker source

## Development

```bash
bun install        # Install dependencies
bun run dev        # Local dev server
bun run deploy     # Deploy to Cloudflare
bun run check      # TypeScript check
```

## License

ISC
