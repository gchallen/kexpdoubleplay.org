# Build stage using Bun
FROM oven/bun:1.2.20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including dev deps for building)
RUN bun install

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# Runtime stage using Node.js 24.6.0
FROM node:24-alpine AS runtime

# Set working directory
WORKDIR /app

# Install curl and Bun for dependency management
RUN apk add --no-cache curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s ~/.bun/bin/bun /usr/local/bin/bun

# Copy package files
COPY package.json ./

# Install only production dependencies using Bun
RUN bun install --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

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
CMD ["node", "dist/index.js"]