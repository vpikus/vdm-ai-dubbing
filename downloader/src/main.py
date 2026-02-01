"""Main entry point for Download Worker."""

import json
import signal
import sys
import time
import traceback
from typing import Any

import redis
import structlog

from .config import config
from .downloader import DownloadError, VideoDownloader, sanitize_filename
from .events import EventPublisher, create_event_publisher
from .types import DownloadJobData, JobStatus, MediaMetadata

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

logger = structlog.get_logger("downloader")

# Global shutdown flag
shutdown_requested = False


def signal_handler(signum: int, frame: Any) -> None:
    """Handle shutdown signals."""
    global shutdown_requested
    logger.info("Shutdown signal received", signal=signum)
    shutdown_requested = True


def parse_job_data(data: dict[str, Any]) -> DownloadJobData:
    """Parse job data from Redis queue."""
    return DownloadJobData(
        job_id=data["jobId"],
        url=data["url"],
        format_preset=data.get("formatPreset", "bestvideo+bestaudio"),
        output_container=data.get("outputContainer", "mkv"),
        requested_dubbing=data.get("requestedDubbing", False),
        target_lang=data.get("targetLang", "ru"),
        use_lively_voice=data.get("useLivelyVoice", False),
        download_subtitles=data.get("downloadSubtitles", False),
        temp_dir=data["tempDir"],
        final_path=data["finalPath"],
        proxy=data.get("proxy"),
        cookies_file=data.get("cookiesFile"),
        rate_limit=data.get("rateLimit"),
    )


def enqueue_bullmq_job(
    redis_client: redis.Redis, queue_name: str, job_data: dict[str, Any], job_name: str = "default"
) -> str:
    """Enqueue a job using BullMQ-compatible format."""
    import time

    # Get next job ID (BullMQ uses incrementing IDs)
    bull_job_id = redis_client.incr(f"bull:{queue_name}:id")

    # BullMQ job format
    job_payload = {
        "id": str(bull_job_id),
        "name": job_name,
        "data": json.dumps(job_data),
        "opts": json.dumps({"attempts": 3, "backoff": {"type": "exponential", "delay": 1000}}),
        "timestamp": int(time.time() * 1000),
        "delay": 0,
        "priority": 0,
        "processedOn": 0,
        "progress": 0,
    }

    # Store job data as hash
    redis_client.hset(f"bull:{queue_name}:{bull_job_id}", mapping=job_payload)

    # Add to waiting list (BullMQ uses lpush for FIFO with rpop)
    redis_client.lpush(f"bull:{queue_name}:wait", str(bull_job_id))

    return str(bull_job_id)


def enqueue_dub_job(
    redis_client: redis.Redis, job: DownloadJobData, video_path: str, metadata: MediaMetadata
) -> None:
    """Enqueue a dubbing job after successful download."""
    # Generate final path with proper filename: "Title [source_id].ext"
    from pathlib import Path
    title = sanitize_filename(metadata.source_title or "untitled")
    source_id = metadata.source_id or job.job_id
    ext = job.output_container
    filename = f"{title} [{source_id}].{ext}"
    final_dir = Path(job.final_path).parent
    final_path = str(final_dir / filename)

    dub_job_data = {
        "jobId": job.job_id,
        "url": job.url,  # Pass original URL for VOT.js API
        "videoPath": video_path,
        "targetLang": job.target_lang,
        "useLivelyVoice": job.use_lively_voice,  # Pass lively voice setting
        "tempDir": job.temp_dir,
        "outputPath": f"{job.temp_dir}/dubbed.wav",
        "finalPath": final_path,  # Pass through for muxer
        "outputContainer": job.output_container,  # Pass through for muxer
    }

    # Add to BullMQ queue with proper format
    bull_job_id = enqueue_bullmq_job(redis_client, "dub", dub_job_data)
    logger.info("Enqueued dubbing job", job_id=job.job_id, bull_job_id=bull_job_id)


def process_job(
    redis_client: redis.Redis,
    event_publisher: EventPublisher,
    downloader: VideoDownloader,
    job_data: dict[str, Any],
) -> None:
    """Process a single download job."""
    job = parse_job_data(job_data)
    log = logger.bind(job_id=job.job_id)

    log.info("Processing download job", url=job.url)

    # Publish state change
    event_publisher.publish_state_change(job.job_id, JobStatus.QUEUED, JobStatus.DOWNLOADING)

    try:
        # Perform download
        video_path, metadata = downloader.download(job)

        log.info(
            "Download successful",
            video_path=video_path,
            title=metadata.source_title,
        )

        # Publish metadata
        import os
        file_size = os.path.getsize(video_path) if os.path.exists(video_path) else None
        event_publisher.publish_metadata(
            job_id=job.job_id,
            source_id=metadata.source_id,
            source_title=metadata.source_title,
            source_uploader=metadata.source_uploader,
            source_upload_date=metadata.source_upload_date,
            source_description=metadata.source_description,
            source_thumbnail_url=metadata.source_thumbnail_url,
            duration_sec=metadata.duration_sec,
            width=metadata.width,
            height=metadata.height,
            fps=metadata.fps,
            video_codec=metadata.video_codec,
            audio_codec=metadata.audio_codec,
            file_size_bytes=file_size,
            file_path=video_path,
        )

        # Update state
        if job.requested_dubbing:
            event_publisher.publish_state_change(
                job.job_id, JobStatus.DOWNLOADING, JobStatus.DOWNLOADED
            )
            # Enqueue dubbing job
            enqueue_dub_job(redis_client, job, video_path, metadata)
        else:
            # No dubbing - mark as complete
            event_publisher.publish_state_change(
                job.job_id, JobStatus.DOWNLOADING, JobStatus.COMPLETE
            )

        event_publisher.publish_log(
            job.job_id, "info", f"Download complete: {metadata.source_title}"
        )

    except DownloadError as e:
        log.error("Download failed", error=str(e), retryable=e.retryable)

        event_publisher.publish_error(
            job_id=job.job_id,
            code="DOWNLOAD_ERROR",
            error_message=str(e),
            retryable=e.retryable,
        )

        # Always mark as FAILED - yt-dlp already exhausted its internal retries
        # The retryable flag is informational for the user to manually retry
        event_publisher.publish_state_change(
            job.job_id, JobStatus.DOWNLOADING, JobStatus.FAILED
        )

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

        event_publisher.publish_state_change(
            job.job_id, JobStatus.DOWNLOADING, JobStatus.FAILED
        )

        raise


def consume_jobs(
    redis_client: redis.Redis,
    event_publisher: EventPublisher,
    downloader: VideoDownloader,
) -> None:
    """Consume jobs from the download queue."""
    queue_key = "download"

    logger.info("Starting job consumer", queue=queue_key)

    while not shutdown_requested:
        try:
            # Block for 5 seconds waiting for a job
            result = redis_client.blpop(queue_key, timeout=5)

            if result is None:
                continue

            _, job_json = result
            job_data = json.loads(job_json)

            try:
                process_job(redis_client, event_publisher, downloader, job_data)
            except Exception as e:
                # Job failed, but continue processing other jobs
                logger.error("Job processing failed", error=str(e))

                # TODO: Implement retry logic with backoff
                # For now, just log and continue

        except redis.exceptions.ConnectionError as e:
            logger.error("Redis connection error", error=str(e))
            time.sleep(5)  # Wait before reconnecting

        except Exception as e:
            logger.error("Unexpected error in job consumer", error=str(e))
            time.sleep(1)


def main() -> None:
    """Main entry point."""
    logger.info(
        "Starting Download Worker",
        redis_url=config.redis_url,
        media_root=config.media_root,
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

    # Create event publisher and downloader
    event_publisher = EventPublisher(redis_client)
    downloader = VideoDownloader(event_publisher)

    # Start consuming jobs
    try:
        consume_jobs(redis_client, event_publisher, downloader)
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        redis_client.close()
        logger.info("Download Worker stopped")


if __name__ == "__main__":
    main()
