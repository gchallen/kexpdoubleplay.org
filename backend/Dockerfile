# Use Bun runtime (matches local development version 1.2.20)
FROM oven/bun:1.2.20-alpine AS base

# Set working directory
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package.json ./

# Install dependencies (generate lockfile if not present)
RUN bun install --production

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# Remove dev dependencies and source files to reduce image size  
RUN rm -rf src tsconfig.json jest.config.js scripts logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S scanner -u 1001

# Create data directory and set permissions
RUN mkdir -p /app/data && chown scanner:nodejs /app/data

# Switch to non-root user
USER scanner

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV DATA_FILE_PATH=/app/data/double-plays.json
ENV API_PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["bun", "run", "dist/index.js"]