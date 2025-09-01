# Runtime stage - minimal Alpine image
FROM alpine:latest

# Set working directory
WORKDIR /app

# Install basic runtime dependencies and C++ standard library
RUN apk add --no-cache curl ca-certificates libstdc++ libgcc

# Copy the compiled executable (built outside container)
COPY ./dist/kexp-doubleplay-backend /app/kexp-doubleplay-backend

# Make it executable
RUN chmod +x /app/kexp-doubleplay-backend

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S scanner -u 1001

# Create data, logs, and backups directories and set permissions
RUN mkdir -p /app/data /app/logs /app/backups && chown scanner:nodejs /app/data /app/logs /app/backups

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
CMD ["./kexp-doubleplay-backend"]