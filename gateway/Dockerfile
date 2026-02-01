# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY gateway/package*.json ./
COPY gateway/tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY gateway/src ./src
COPY gateway/migrations ./migrations

# Copy shared types to location expected by import paths (../../types from src/)
COPY shared/types ./types

# Adjust tsconfig for Docker build (remove rootDir constraint)
RUN sed -i 's/"rootDir": ".\/src",//' tsconfig.json

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache curl

# Copy package files
COPY gateway/package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Create data directories
RUN mkdir -p /app/data /app/media/incomplete /app/media/complete /app/public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/healthz || exit 1

# Start server (tsc outputs to dist/src/ when rootDir is removed for shared types)
CMD ["node", "dist/src/server.js"]
