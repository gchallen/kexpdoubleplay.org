# Docker Commands

This document describes the Docker commands available for the KEXP Double Play Scanner backend.

**Note:** This project uses Bun's single-file executable compilation:
- **Compilation**: Bun v1.2.20 compiles the entire application into a standalone executable outside the container
- **Runtime**: Minimal Alpine Linux container runs the compiled executable directly
- **Cross-Platform**: Separate compilation commands for different architectures (ARM64/x64)
- **Benefits**: No Node.js/Bun runtime needed in container, faster startup, smaller image size

## Available Commands

### `npm run compile`
**Compile executable (ARM64)** - Creates standalone executable for ARM64 architecture.

- Compiles `src/index.ts` for Alpine Linux ARM64 using `--target=bun-linux-arm64-musl`
- Same as `npm run compile:arm64`

### `npm run compile:arm64`
**Compile for ARM64** - Creates ARM64 musl executable.

### `npm run compile:x64`  
**Compile for x64** - Creates x64 musl executable.

**All compile commands:**
- Include all dependencies and workspace packages
- Output: `dist/kexp-doubleplay-backend` executable (dist/ in .gitignore)
- Cross-compile from macOS to Alpine Linux

### `npm run docker:run`
**Build and run locally** - Compiles executable, builds container, and runs it.

- Compiles executable for ARM64 musl (Alpine Linux)
- Builds single-platform container (linux/arm64) for local use
- Respects `API_PORT` environment variable (defaults to 3000)
- Mounts local `data/`, `logs/`, and `backups/` directories  
- Loads environment from `.env` file
- Simple local development and testing

### `npm run docker:build`
**Build only** - Compiles and builds the container without running.

- Same as docker:run but doesn't start the container
- Creates local `kexp-doubleplay-backend` image

### `npm run docker:push`
**Build and push to registry** - Builds multi-platform and pushes to Docker Hub.

- Builds for both linux/amd64 and linux/arm64 platforms
- Pushes to geoffreychallen/kexp-doubleplay-backend with latest and version tags
- Requires Docker registry authentication

## Volume Mounts

The docker:run command mounts these directories:

- `./data:/app/data` - Scanner data persistence
- `./logs:/app/logs` - Application logs  
- `./backups:/app/backups` - Local backup storage
- `.env` file - Environment configuration

## Port Configuration

- Default: Port 3000 (host:container)
- Override with `API_PORT` environment variable (e.g., `API_PORT=8080 npm run docker:run`)
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

# Build and run container locally
npm run docker:run

# Run with custom port  
API_PORT=8080 npm run docker:run

# Build container only (without running)
npm run docker:build

# Build and push to Docker Hub registry
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