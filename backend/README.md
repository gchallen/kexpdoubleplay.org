# KEXP Double Play Scanner - Backend

REST API service for scanning and detecting double plays from KEXP radio station playlist data.

## Quick Start

### Development
```bash
bun dev
```

### Production
```bash
bun build
bun start
```

### Docker
```bash
# Build multi-platform image
bun docker:build

# Push to registry
bun docker:push
```

## Environment Variables

- `DATA_FILE_PATH`: JSON storage location (default: `./double-plays.json`)
- `API_PORT`: REST API server port (default: `3000`)
- `LOG_LEVEL`: Winston logging level (default: `info`)
- `RATE_LIMIT_DELAY`: API request throttling (default: `1000ms`)
- `SCAN_INTERVAL_MINUTES`: Periodic scan frequency (default: `5`)

## API Endpoints

- `GET /api/health` - Scanner health and status
- `GET /api/double-plays` - All double plays data
- `GET /api/double-plays/paginated` - Paginated double plays
- `GET /api/stats` - Artist/DJ/show statistics

## Docker Deployment

The backend is containerized with multi-platform support:

```bash
docker run -d \
  --name kexp-scanner \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  geoffreychallen/kexp-doubleplay-backend:latest
```

## Architecture

- **Scanner**: Main orchestrator managing scanning lifecycle
- **KEXPApi**: HTTP client with exponential backoff and connection pooling  
- **DoublePlayDetector**: Analyzes playlist data for consecutive plays of same album tracks
- **Storage**: JSON file persistence with sorted data
- **ApiServer**: Express REST API with comprehensive validation

See `CLAUDE.md` for detailed development guidelines.