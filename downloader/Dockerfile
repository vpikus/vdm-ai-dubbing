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
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then \
        DENO_ARCH="aarch64-unknown-linux-gnu"; \
    else \
        DENO_ARCH="x86_64-unknown-linux-gnu"; \
    fi && \
    curl -fsSL "https://github.com/denoland/deno/releases/latest/download/deno-${DENO_ARCH}.zip" -o /tmp/deno.zip && \
    unzip /tmp/deno.zip -d /usr/local/bin && \
    rm /tmp/deno.zip && \
    chmod +x /usr/local/bin/deno

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
    CMD python -c "import redis; r = redis.Redis.from_url('${REDIS_URL:-redis://localhost:6379}'); r.ping()" || exit 1

# Run worker
CMD ["python", "-m", "src.main"]
