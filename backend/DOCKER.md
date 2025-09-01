# Docker Commands

This document describes the Docker commands available for the KEXP Double Play Scanner backend.

**Note:** This project uses Bun's single-file executable compilation:
- **Compilation**: Bun v1.2.20 compiles the entire application into a standalone executable outside the container
- **Runtime**: Minimal Alpine Linux container runs the compiled executable directly
- **Benefits**: No Node.js/Bun runtime needed in container, faster startup, smaller image size

## Available Commands

### `npm run compile`
**Compile executable** - Creates standalone executable using Bun.

- Compiles `src/index.ts` into a single-file executable
- Includes all dependencies and workspace packages
- Output: `kexp-doubleplay-backend` executable (added to .gitignore)
- Required before Docker builds

### `npm run docker:run`
**Production Docker run** - Builds and runs the production container locally.

- Builds multi-platform container with latest and versioned tags
- Runs with production configuration
- Maps port 3000:3000
- Mounts local `data/` and `logs/` directories
- Loads environment from `.env` file
- Uses versioned tag from package.json

### `npm run docker:run:dev`
**Development Docker run** - Builds and runs a local development container.

- Builds single-platform (amd64) container for faster builds
- Uses local development tag (`kexp-doubleplay-backend:dev`)
- Same port mapping and volume mounts as production
- Ideal for testing Docker builds during development

### `npm run docker:run:local` 
**Local testing** - Builds and runs with configurable port.

- Respects `API_PORT` environment variable for port mapping
- Uses local tag (`kexp-doubleplay-backend:local`)
- Useful when testing different port configurations

### `npm run docker:build`
**Build only** - Builds the production container without running.

- Multi-platform build (linux/amd64, linux/arm64)
- Creates both `latest` and versioned tags
- Version automatically read from package.json

### `npm run docker:push`
**Build and push** - Builds and pushes to registry.

- Same as docker:build but pushes to Docker registry
- Requires appropriate Docker registry authentication

## Volume Mounts

All run commands mount these directories:

- `./data:/app/data` - Scanner data persistence
- `./logs:/app/logs` - Application logs
- `.env` file - Environment configuration

## Port Configuration

- Default: Port 3000 (host:container)
- Override with `API_PORT` environment variable in docker:run:local
- Container always exposes port 3000 internally

## Environment Variables

All Docker run commands load environment variables from `.env` file. Ensure your `.env` file contains:

```env
# API Configuration
API_PORT=3000
DATA_FILE_PATH=/app/data/double-plays.json

# KEXP API
RATE_LIMIT_DELAY=1000

# Backup Configuration (optional)
GITHUB_BACKUP_ENABLED=true
GITHUB_TOKEN=your_token_here
GITHUB_REPO_OWNER=your_username
GITHUB_REPO_NAME=your_repo
LOCAL_BACKUP_PATH=/app/data/backups

# Logging
LOG_LEVEL=info
```

## Examples

```bash
# Compile standalone executable
npm run compile

# Run production container locally (compiles first)
npm run docker:run

# Run development container for testing (compiles first)
npm run docker:run:dev

# Run with custom port (set API_PORT=8080 in .env, compiles first)
npm run docker:run:local

# Build container only (compiles first)
npm run docker:build

# Build and push to registry (compiles first)
npm run docker:push
```

## Build Process

1. **Compilation**: `bun build --compile` creates a standalone executable containing:
   - Bundled TypeScript/JavaScript code
   - All dependencies from package.json
   - Workspace dependencies (like @kexp-doubleplay/types)
   - Bun runtime embedded

2. **Docker Build**: Copies the pre-compiled executable into minimal Alpine container

3. **Runtime**: Container executes the standalone binary directly (no Node.js/Bun installation needed)

## Troubleshooting

### Permission Issues
If you encounter permission issues with mounted volumes, ensure the local directories are writable:

```bash
chmod 755 data logs
```

### Environment File Missing
Ensure `.env` file exists in the backend directory:

```bash
cp .env.example .env  # if you have an example
# or create .env with required variables
```

### Port Conflicts
If port 3000 is in use, either:
- Stop the conflicting service
- Use `docker:run:local` with different `API_PORT` in .env
- Manually modify the port mapping: `-p 8080:3000`