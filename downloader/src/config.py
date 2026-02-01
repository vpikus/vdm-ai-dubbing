"""Configuration module for Download Worker."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Download worker configuration."""

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # Media storage
    media_root: str = os.getenv("MEDIA_ROOT", "./media")
    download_temp_dir: str = os.getenv("DOWNLOAD_TEMP_DIR", "./media/incomplete")

    # Worker settings
    max_retries: int = int(os.getenv("MAX_RETRIES", "3"))
    retry_backoff_base: float = float(os.getenv("RETRY_BACKOFF_BASE", "2.0"))

    # Download settings
    rate_limit: str | None = os.getenv("DOWNLOAD_RATE_LIMIT")
    proxy: str | None = os.getenv("DOWNLOAD_PROXY")

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")


config = Config()
