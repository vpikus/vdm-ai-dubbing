"""Configuration module for Muxing Worker."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Muxing worker configuration."""

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # Media storage
    media_root: str = os.getenv("MEDIA_ROOT", "./media")

    # Worker settings
    concurrency: int = int(os.getenv("MUXING_CONCURRENCY", "1"))

    # Audio mixing settings
    default_container: str = os.getenv("DEFAULT_CONTAINER", "mkv")
    ducking_level: float = float(os.getenv("DUCKING_LEVEL", "0.3"))
    normalization_lufs: float = float(os.getenv("NORMALIZATION_LUFS", "-18.0"))

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")


config = Config()
