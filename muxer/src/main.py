"""Main entry point for Muxing Worker."""

import json
import re
import shutil
import signal
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any

import redis
import structlog

from .config import config
from .events import EventPublisher
from .muxer import AudioMuxer, MuxingError
from .types import MuxJobData

# Configure structlog for PrintLogger (no stdlib processors)
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),  # Accept all log levels
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("muxer")


def redact_redis_url(url: str) -> str:
    """Redact password from Redis URL for safe logging."""
    # Pattern: redis[s]://[username:]password@host:port (handles both redis:// and rediss://)
    return re.sub(r"(rediss?://[^:]*:)[^@]+(@)", r"\1***\2", url)


# Thread-safe shutdown event
shutdown_event = threading.Event()


def signal_handler(signum: int, _frame: Any) -> None:
    """Handle shutdown signals."""
    logger.info("Shutdown signal received", signal=signum)
    shutdown_event.set()


def parse_job_data(data: dict[str, Any]) -> MuxJobData:
    """Parse job data from Redis queue."""
    return MuxJobData(
        job_id=data["jobId"],
        video_path=data["videoPath"],
        audio_dubbed_path=data["audioDubbedPath"],
        target_lang=data.get("targetLang", "ru"),  # Default to Russian (primary dubbing language)
        output_container=data.get("outputContainer", config.default_container),
        ducking_level=data.get("duckingLevel", config.ducking_level),
        normalization_lufs=data.get("normalizationLufs", config.normalization_lufs),
        temp_dir=data["tempDir"],
        final_path=data["finalPath"],
    )


def cleanup_temp_dir(temp_dir: str) -> None:
    """Clean up temporary directory after job completion."""
    try:
        temp_path = Path(temp_dir)
        if temp_path.exists():
            shutil.rmtree(temp_path)
            logger.debug("Cleaned up temp directory", path=temp_dir)
    except Exception as e:
        logger.warning("Failed to clean up temp directory", path=temp_dir, error=str(e))


def process_job(
    event_publisher: EventPublisher,
    muxer: AudioMuxer,
    job_data: dict[str, Any],
) -> None:
    """Process a single muxing job."""
    job = parse_job_data(job_data)
    log = logger.bind(job_id=job.job_id)

    log.info("Processing muxing job", video=job.video_path)

    # Publish state change
    event_publisher.publish_state_change(job.job_id, "DUBBED", "MUXING")

    try:
        # Perform muxing
        output_path = muxer.process(job)

        log.info("Muxing successful", output=output_path)

        # Update state to COMPLETE
        event_publisher.publish_state_change(job.job_id, "MUXING", "COMPLETE")
        event_publisher.publish_log(job.job_id, "info", f"Processing complete: {output_path}")

        # Clean up temp directory
        cleanup_temp_dir(job.temp_dir)

    except MuxingError as e:
        log.error("Muxing failed", error=str(e), retryable=e.retryable)

        event_publisher.publish_error(
            job_id=job.job_id,
            code="MUXING_ERROR",
            error_message=str(e),
            retryable=e.retryable,
        )

        event_publisher.publish_state_change(job.job_id, "MUXING", "FAILED")
        raise

    except Exception as e:
        log.error("Unexpected error", error=str(e))

        event_publisher.publish_error(
            job_id=job.job_id,
            code="UNEXPECTED_ERROR",
            error_message=str(e),
            retryable=False,
            stack=traceback.format_exc(),
        )

        event_publisher.publish_state_change(job.job_id, "MUXING", "FAILED")
        raise


def consume_jobs(
    redis_client: redis.Redis,
    event_publisher: EventPublisher,
    muxer: AudioMuxer,
) -> None:
    """Consume jobs from the muxing queue."""
    queue_key = "mux"

    logger.info("Starting job consumer", queue=queue_key)

    while not shutdown_event.is_set():
        try:
            # Block for 5 seconds waiting for a job
            result = redis_client.blpop([queue_key], timeout=5)

            if result is None:
                continue

            _, job_json = result  # type: ignore[misc]
            job_data = json.loads(job_json)

            try:
                process_job(event_publisher, muxer, job_data)
            except Exception as e:
                # Job failed, but continue processing other jobs
                logger.error("Job processing failed", error=str(e))

        except redis.exceptions.ConnectionError as e:
            logger.error("Redis connection error", error=str(e))
            time.sleep(5)  # Wait before reconnecting

        except Exception as e:
            logger.error("Unexpected error in job consumer", error=str(e))
            time.sleep(1)


def main() -> None:
    """Main entry point."""
    logger.info(
        "Starting Muxing Worker",
        redis_url=redact_redis_url(config.redis_url),
        media_root=config.media_root,
        concurrency=config.concurrency,
    )

    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Connect to Redis
    try:
        redis_client = redis.Redis.from_url(config.redis_url)
        redis_client.ping()
        logger.info("Connected to Redis")
    except redis.exceptions.ConnectionError as e:
        logger.error("Failed to connect to Redis", error=str(e))
        sys.exit(1)

    # Create event publisher and muxer
    event_publisher = EventPublisher(redis_client)
    muxer = AudioMuxer(event_publisher)

    # Start consuming jobs
    try:
        consume_jobs(redis_client, event_publisher, muxer)
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        redis_client.close()
        logger.info("Muxing Worker stopped")


if __name__ == "__main__":
    main()
