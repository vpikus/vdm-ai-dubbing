# Muxing Worker Dockerfile
FROM python:3.11-slim

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (uid 1001 to match gateway for shared volume permissions)
RUN useradd -m -u 1001 worker

WORKDIR /app

# Copy source code and install dependencies
COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir . && \
    pip cache purge

# Create media directories
RUN mkdir -p /app/media/incomplete /app/media/complete && \
    chown -R worker:worker /app

USER worker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import os; import redis; r = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379')); r.ping()" || exit 1

# Run worker
CMD ["python", "-m", "src.main"]
