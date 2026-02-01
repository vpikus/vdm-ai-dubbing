# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install FFmpeg and curl
RUN apk add --no-cache ffmpeg curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create media directories
RUN mkdir -p /app/media/incomplete /app/media/complete

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port for health check (optional)
EXPOSE 8002

# Health check (using dynamic import for ES modules)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node --input-type=module -e "const Redis = (await import('ioredis')).default; await new Redis(process.env.REDIS_URL).ping();"

# Run worker
CMD ["node", "dist/main.js"]
