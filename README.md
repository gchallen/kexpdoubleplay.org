# KEXP Double Play Scanner

A TypeScript application that monitors KEXP radio station's playlist to detect "double plays" - when DJs play the same song back-to-back.

## Features

- Fetches playlist data from KEXP's v2 API
- Detects double plays (including those separated by air breaks)
- Persists discoveries to a JSON file
- Performs forward and backward scanning
- Automatic periodic updates
- Rate limiting to respect API limits

## Installation

```bash
bun install
```

## Usage

### Development
```bash
bun run dev    # Run with tsx (hot reload)
```

### Production
```bash
bun run build  # Compile TypeScript
bun start      # Run compiled JavaScript
```

### Testing
```bash
bun test       # Run tests with bun's built-in test runner
bun run test:jest  # Run tests with Jest
```

## Configuration

Environment variables:
- `DATA_FILE_PATH` - Where to save double plays (default: `./double-plays.json`)
- `RATE_LIMIT_DELAY` - Milliseconds between API calls (default: 1000)
- `SCAN_INTERVAL_MINUTES` - How often to check for new plays (default: 5)
- `MAX_HOURS_PER_REQUEST` - Hours of data per API request (default: 1)

## Project Structure

- `src/index.ts` - Main entry point
- `src/api.ts` - KEXP API client
- `src/detector.ts` - Double play detection algorithm
- `src/scanner.ts` - Scanning orchestration
- `src/storage.ts` - JSON persistence
- `src/config.ts` - Configuration management
- `src/detector.test.ts` - Test suite

## Requirements

- Bun runtime
- TypeScript 5.x