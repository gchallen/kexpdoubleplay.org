# CLAUDE.md - Project Instructions for KEXP Double Play Scanner

## Project Overview
This is a TypeScript application that monitors KEXP radio station's playlist to detect "double plays" - consecutive plays of the same song. The project uses bun as the runtime and package manager.

## Key Technologies
- **Runtime**: Bun (not Node.js/npm)
- **Language**: TypeScript 5.x
- **HTTP Client**: node-fetch with connection pooling
- **Logging**: Winston with structured JSON logging
- **Testing**: Bun's built-in test runner and Jest
- **API**: Express.js REST server

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
- Always use `bun install`, `bun add`, `bun run` (never npm/yarn)
- Dependencies are managed via bun.lock (not package-lock.json)

### Code Standards
- Replace any `console.log` with `logger.info/debug/warn/error`
- Use structured logging with contextual metadata
- Implement proper error handling with health status tracking
- Follow existing TypeScript patterns and interfaces

### Configuration
Environment variables are defined in `src/config.ts`:
- `DATA_FILE_PATH`: JSON storage location
- `API_PORT`: REST API server port  
- `LOG_LEVEL`: Winston logging level
- `RATE_LIMIT_DELAY`: API request throttling
- `SCAN_INTERVAL_MINUTES`: Periodic scan frequency

### Testing
- Unit tests use Bun's built-in test runner (`bun test`)
- Integration tests verify real KEXP API responses
- Known test data: Pulp "Spike Island" double play on 2025-04-10

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

### Adding New Features
1. Update TypeScript interfaces in `src/types.ts` if needed
2. Implement with proper logging using `logger` from `./logger`
3. Add error handling with health status updates
4. Update REST API endpoints if exposing new data
5. Add tests using `bun test`

### Debugging
- Set `LOG_LEVEL=debug` for verbose logging
- Check `logs/combined.log` for structured JSON logs
- Use `/api/health` endpoint to check system status
- Monitor API health via `kexpApi` section in health response

### Deployment
- Build: `bun run build`
- Logs directory created automatically
- Monitor via `tail -f logs/combined.log`
- Use health endpoints for uptime monitoring

## Important Notes
- Double plays are rare events - the JSON file won't grow large
- KEXP API rate limiting is respected (1000ms default delay)
- Connection pooling keeps HTTP connections alive for efficiency
- System gracefully handles KEXP API outages without crashing
- All timestamps are ISO 8601 UTC format

## Testing Real Data
The integration test uses actual KEXP API data. Known double play for testing:
- Artist: Pulp
- Song: "Spike Island"  
- Date: April 10, 2025
- Play IDs: 3487084, 3487086

This ensures the detector works with real KEXP API responses and data structures.