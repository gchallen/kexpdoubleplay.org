# CLAUDE.md - Project Instructions for KEXP Double Play Scanner

## Project Overview
This is a **multi-workspace project** consisting of a backend API service and a frontend for detecting and displaying KEXP radio double plays.

### Workspace Structure
- **`backend/`**: TypeScript scanner service + REST API (uses Bun runtime)
- **`frontend/`**: Express SSR server with vanilla HTML/JS templates

## Key Technologies

### Backend
- **Runtime**: Bun (not Node.js/npm)
- **Language**: TypeScript 5.x
- **HTTP Client**: node-fetch with connection pooling
- **Logging**: Winston with structured JSON logging
- **Testing**: Bun's built-in test runner and Jest
- **API**: Express.js REST server
- **Containerization**: Docker with multi-platform support

### Frontend
- **Server**: Express.js with server-side HTML templating
- **Language**: Vanilla JavaScript (no build step)
- **Deployment**: Node.js server (Vercel or any hosting)

## Architecture Components

### Core Classes
- `Scanner`: Main orchestrator, manages scanning lifecycle and API server
- `KEXPApi`: HTTP client with exponential backoff and connection pooling  
- `DoublePlayDetector`: Analyzes playlist data to find consecutive plays
- `Storage`: JSON file persistence with sorted data
- `ApiServer`: Express REST API for monitoring and data access

### Important Patterns
- **Incremental Scanning**: Uses `startTime`/`endTime` timestamps for efficient scanning
- **Cascade Failure Prevention**: Exponential backoff (5s to 5min) during API outages
- **Graceful Degradation**: Continues running when KEXP API is down
- **Structured Logging**: All console.log replaced with Winston structured logging

## Development Guidelines

### Package Management
- **Always use `bun install`, `bun add`, `bun dev`, `bun test`** (never npm/yarn)
- **Pin all dependencies to exact versions**: Never use `^` or `~` version ranges in any package.json (root, types, backend, or frontend). This ensures reproducible builds across all environments.
- Dependencies managed via bun.lockb files in each workspace
- **Root workspace**: `bun install` manages all workspaces
- **Individual workspaces**: `cd backend && bun install` or `cd frontend && bun install`

### Code Standards
- Replace any `console.log` with `logger.info/debug/warn/error`
- Use structured logging with contextual metadata
- Implement proper error handling with health status tracking
- Follow existing TypeScript patterns and interfaces

### Configuration

#### Backend
Environment variables are defined in `backend/src/config.ts`:
- `DATA_FILE_PATH`: JSON storage location (default: `./double-plays.json`)
- `API_PORT`: REST API server port (default: `3000`)
- `LOG_LEVEL`: Winston logging level
- `RATE_LIMIT_DELAY`: API request throttling
- `SCAN_INTERVAL_MINUTES`: Periodic scan frequency

See `backend/BACKEND.md` for complete environment variable reference.

#### Frontend
Environment variables are set in `frontend/server.js`:
- `PORT`: Server port (default: 8080)
- `BACKEND_API_URL`: Hardcoded to `https://api.kexpdoubleplays.org`

### Testing

#### Backend
- Unit tests use Bun's built-in test runner (`bun test`)
- Integration tests verify real KEXP API responses
- Known test data: Pulp "Spike Island" double play on 2025-04-10
- GitHub backup testing: `bun test:github`, `bun test:backup`

#### Frontend
- No test framework configured
- Manual testing via `node server.js`

## Key Features to Preserve

### Double Play Detection Logic
- Handles consecutive plays separated by airbreaks
- Supports multiple plays (double, triple, quadruple+)
- Enriches with DJ/show information lazily (only for detected double plays)

### API Health Monitoring
- Tracks consecutive failures and recovery
- Exponential backoff prevents cascade failures
- Health status exposed via `/api/health` endpoint

### REST API Endpoints
- `/api/health`: System and scanner status
- `/api/double-plays`: Complete dataset
- `/api/double-plays/paginated`: Paginated access
- `/api/stats`: Artist/DJ/show statistics

### Logging System
- Console: Colorized in development, JSON in production
- Files: `logs/combined.log` and `logs/error.log`
- Structured with service metadata and contextual information

## Common Tasks

### Backend Development
#### Adding New Features
1. Update TypeScript interfaces in `backend/src/types.ts` if needed
2. Implement with proper logging using `logger` from `./logger`
3. Add error handling with health status updates
4. Update REST API endpoints if exposing new data
5. Add tests using `bun test`

#### Debugging
- Set `LOG_LEVEL=debug` for verbose logging
- Check `backend/logs/combined.log` for structured JSON logs
- Use `/api/health` endpoint to check system status
- Monitor API health via `kexpApi` section in health response

#### Deployment
- Docker: `bun docker:build` and `bun docker:push`
- Build: `bun build` (in backend directory)
- Monitor via `tail -f backend/logs/combined.log`
- Use health endpoints for uptime monitoring

### Frontend Development
#### Adding New Features
1. Edit `frontend/template.html` for layout changes
2. Edit `frontend/server.js` for data processing and new routes
3. Follow KEXP design aesthetic (minimal, clean)
4. Ensure mobile responsiveness

#### Debugging
- Run: `node frontend/server.js`
- Browser dev tools for client-side debugging
- Network tab to monitor API calls

#### Deployment
- Run: `node server.js` (in frontend directory)
- Set `PORT` environment variable if needed

## Important Notes
- Double plays are rare events - the JSON file won't grow large
- KEXP API rate limiting is respected (1000ms default delay)
- Connection pooling keeps HTTP connections alive for efficiency
- System gracefully handles KEXP API outages without crashing
- All timestamps are ISO 8601 UTC format

## Data Recovery and Backup Loading

The scanner automatically attempts to recover data from backups when starting:

### Startup Data Loading Logic
1. **Local file exists**: Uses local `double-plays.json` if available
2. **Local file missing**: Automatically loads from backup (GitHub or local backup files)
3. **Date range comparison**: Uses the dataset with the longer date range (more hours of coverage)
4. **Fresh start**: Creates new data structure if no local file or backup exists

### Command Line Flags
- `--restart`: Skip backup loading and start fresh (ignores all backup data)
- `--force-local`: Force use of local data only (ignore backups even if they have more data)
- `--force-backup`: Force use of backup data only (ignore local file even if it exists)
- `--progress`: Enable progress bar mode (suppresses console logging)
- `--debug`: Enable verbose debug logging

### Backup Data Sources (in priority order)
1. **GitHub backup**: Latest commit in configured repository
2. **Local backup files**: Most recent file in `LOCAL_BACKUP_PATH` directory
3. **Fresh start**: New data structure with 7-day lookback window

The scanner will automatically save recovered backup data to the local file for future use.

## Testing Real Data
The integration test uses actual KEXP API data. Known double play for testing:
- Artist: Pulp
- Song: "Spike Island"  
- Date: April 10, 2025
- Play IDs: 3487084, 3487086

This ensures the detector works with real KEXP API responses and data structures.