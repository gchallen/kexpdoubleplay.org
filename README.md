# KEXP Double Play Scanner

A TypeScript application that continuously monitors [KEXP](https://kexp.org) radio station's playlist to detect and catalog "double plays" - when the same song is played consecutively (separated only by air breaks).

## Features

- **Real-time Detection**: Continuously scans KEXP's playlist API for double plays
- **Incremental Scanning**: Efficient forward/backward scanning with timestamp tracking
- **Cascade Failure Prevention**: Exponential backoff and graceful degradation during API outages
- **REST API**: Health monitoring and data access endpoints
- **Structured Logging**: Winston-based logging with configurable levels and JSON output
- **Connection Pooling**: HTTP keep-alive for optimized API performance

## Quick Start

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build

# Run production build
bun run start
```

The scanner will start immediately and begin detecting double plays. The REST API will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_FILE_PATH` | `./double-plays.json` | Path to store double play data |
| `API_PORT` | `3000` | Port for REST API server |
| `RATE_LIMIT_DELAY` | `1000` | Delay between API requests (ms) |
| `SCAN_INTERVAL_MINUTES` | `5` | Periodic scan interval |
| `MAX_HOURS_PER_REQUEST` | `1` | Max time range per API request |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## REST API Endpoints

### Health Check
```
GET /api/health
```
Returns scanner status, system information, and API health metrics.

### Double Plays Data
```
GET /api/double-plays
```
Returns all detected double plays with metadata.

### Paginated Data
```
GET /api/double-plays/paginated?page=1&limit=10
```
Returns paginated double plays (max 100 per page).

### Statistics
```
GET /api/stats
```
Returns aggregated statistics about artists, DJs, shows, and play counts.

### API Documentation
```
GET /api
```
Returns available endpoints and API information.

## Data Structure

Double plays are stored in JSON format:

```json
{
  "startTime": "2025-04-10T15:08:40.000Z",
  "endTime": "2025-04-10T15:13:44.000Z", 
  "doublePlays": [
    {
      "artist": "Pulp",
      "title": "Spike Island",
      "plays": [
        {
          "timestamp": "2025-04-10T15:08:40.000Z",
          "play_id": 3487084
        },
        {
          "timestamp": "2025-04-10T15:13:44.000Z", 
          "play_id": 3487086
        }
      ],
      "dj": "John Richards",
      "show": "The Morning Show"
    }
  ]
}
```

## Logging

The application uses Winston for structured logging:

- **Console**: Colorized output in development
- **Files**: JSON logs written to `logs/combined.log` and `logs/error.log`
- **Levels**: Configure with `LOG_LEVEL` environment variable

Example log entries:
```json
{"level":"info","message":"Double plays detected!","count":1,"plays":["Pulp - Spike Island"]}
{"level":"warn","message":"API backoff in effect","waitTimeSeconds":20,"consecutiveFailures":3}
```

## Failure Handling

The scanner implements robust failure handling:

- **Exponential Backoff**: 5s to 5min delays during API failures
- **Health Tracking**: Monitors consecutive failures and recovery
- **Graceful Degradation**: Continues running during API outages
- **Status Reporting**: REST endpoints show retrieval status (running/stopped)

## Architecture

- **Scanner**: Orchestrates scanning operations and manages lifecycle
- **API Client**: Handles KEXP API requests with connection pooling and backoff
- **Detector**: Analyzes playlists to identify double plays
- **Storage**: Manages JSON file persistence with sorted data
- **API Server**: Provides REST endpoints for monitoring and data access

## Development

```bash
# Run tests
bun test

# Run with debug logging
LOG_LEVEL=debug bun run dev

# Type checking
bun run build
```

## Production Deployment

1. Build the application:
   ```bash
   bun run build
   ```

2. Set production environment variables:
   ```bash
   export NODE_ENV=production
   export LOG_LEVEL=info
   export API_PORT=3000
   ```

3. Start the service:
   ```bash
   bun run start
   ```

4. Monitor logs:
   ```bash
   tail -f logs/combined.log
   ```

## API Examples

Check system health:
```bash
curl http://localhost:3000/api/health
```

Get recent double plays:
```bash
curl http://localhost:3000/api/double-plays/paginated?limit=5
```

View statistics:
```bash
curl http://localhost:3000/api/stats
```

## Project Structure

- `src/index.ts` - Main entry point with graceful shutdown
- `src/scanner.ts` - Scanning orchestration and lifecycle management
- `src/api.ts` - KEXP API client with connection pooling and backoff
- `src/detector.ts` - Double play detection algorithm
- `src/storage.ts` - JSON file persistence with sorted data
- `src/api-server.ts` - REST API endpoints for monitoring and data access
- `src/logger.ts` - Winston logging configuration
- `src/config.ts` - Configuration management
- `src/types.ts` - TypeScript type definitions

## Requirements

- **Bun runtime**: Modern JavaScript runtime and package manager
- **TypeScript 5.x**: For type safety and development experience

## License

ISC

## Contributing

This project detects rare but exciting musical moments on KEXP. Double plays are uncommon events, making each discovery special for music lovers and radio enthusiasts.