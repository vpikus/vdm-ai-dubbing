# Download Worker Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno - the recommended JS runtime for yt-dlp YouTube support
# See https://github.com/yt-dlp/yt-dlp/wiki/EJS
# Deno is enabled by default in yt-dlp (unlike Node.js which requires explicit config)
# Using official install script with pinned version for reliability
ARG DENO_VERSION=2.1.4
ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh -s v${DENO_VERSION} && \
    deno --version

# Create non-root user (uid 1001 to match gateway for shared volume permissions)
RUN useradd -m -u 1001 worker

WORKDIR /app

# Copy source code and install dependencies
COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir . && \
    # Install yt-dlp nightly/pre-release for latest fixes
    pip install -U --pre "yt-dlp[default]" && \
    pip cache purge

# Create media directories
RUN mkdir -p /app/media/incomplete /app/media/complete && \
    chown -R worker:worker /app

USER worker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import os, redis; r = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379')); r.ping()" || exit 1

# Run worker
CMD ["python", "-m", "src.main"]
