"""Redis Pub/Sub event publishing for Download Worker."""

import json
from typing import Any

import redis
import structlog

from .config import config
from .types import EventMessage

logger = structlog.get_logger(__name__)


class EventPublisher:
    """Publishes events to Redis Pub/Sub channels."""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    def publish(self, channel: str, message: EventMessage) -> None:
        """Publish an event message to a channel."""
        try:
            payload = json.dumps(
                {
                    "jobId": message.job_id,
                    "type": message.type,
                    "timestamp": message.timestamp,
                    "payload": message.payload,
                }
            )
            self.redis.publish(channel, payload)
        except Exception as e:
            logger.error("Failed to publish event", channel=channel, error=str(e))

    def publish_progress(
        self,
        job_id: str,
        stage: str,
        percent: float,
        downloaded_bytes: int | None = None,
        total_bytes: int | None = None,
        speed: float | None = None,
        eta: int | None = None,
    ) -> None:
        """Publish a progress event."""
        payload: dict[str, Any] = {
            "stage": stage,
            "percent": percent,
        }

        if downloaded_bytes is not None:
            payload["downloadedBytes"] = downloaded_bytes
        if total_bytes is not None:
            payload["totalBytes"] = total_bytes
        if speed is not None:
            payload["speed"] = speed
        if eta is not None:
            payload["eta"] = eta

        message = EventMessage.create(job_id, "progress", payload)
        self.publish("events:progress", message)

    def publish_state_change(
        self, job_id: str, from_status: str, to_status: str
    ) -> None:
        """Publish a state change event."""
        payload = {
            "from": from_status,
            "to": to_status,
        }
        message = EventMessage.create(job_id, "state_change", payload)
        self.publish("events:state", message)

    def publish_log(self, job_id: str, level: str, log_message: str) -> None:
        """Publish a log event."""
        payload = {
            "level": level,
            "message": log_message,
        }
        message = EventMessage.create(job_id, "log", payload)
        self.publish("events:log", message)

    def publish_error(
        self,
        job_id: str,
        code: str,
        error_message: str,
        retryable: bool,
        stack: str | None = None,
    ) -> None:
        """Publish an error event."""
        payload: dict[str, Any] = {
            "code": code,
            "message": error_message,
            "retryable": retryable,
        }
        if stack:
            payload["stack"] = stack

        message = EventMessage.create(job_id, "error", payload)
        self.publish("events:error", message)

    def publish_metadata(
        self,
        job_id: str,
        source_id: str | None = None,
        source_title: str | None = None,
        source_uploader: str | None = None,
        source_upload_date: str | None = None,
        source_description: str | None = None,
        source_thumbnail_url: str | None = None,
        duration_sec: int | None = None,
        width: int | None = None,
        height: int | None = None,
        fps: float | None = None,
        video_codec: str | None = None,
        audio_codec: str | None = None,
        file_size_bytes: int | None = None,
        file_path: str | None = None,
    ) -> None:
        """Publish a metadata event with media information."""
        payload: dict[str, Any] = {}

        if source_id is not None:
            payload["sourceId"] = source_id
        if source_title is not None:
            payload["sourceTitle"] = source_title
        if source_uploader is not None:
            payload["sourceUploader"] = source_uploader
        if source_upload_date is not None:
            payload["sourceUploadDate"] = source_upload_date
        if source_description is not None:
            payload["sourceDescription"] = source_description
        if source_thumbnail_url is not None:
            payload["sourceThumbnailUrl"] = source_thumbnail_url
        if duration_sec is not None:
            payload["durationSec"] = duration_sec
        if width is not None:
            payload["width"] = width
        if height is not None:
            payload["height"] = height
        if fps is not None:
            payload["fps"] = fps
        if video_codec is not None:
            payload["videoCodec"] = video_codec
        if audio_codec is not None:
            payload["audioCodec"] = audio_codec
        if file_size_bytes is not None:
            payload["fileSizeBytes"] = file_size_bytes
        if file_path is not None:
            payload["filePath"] = file_path

        message = EventMessage.create(job_id, "metadata", payload)
        self.publish("events:metadata", message)


def create_event_publisher() -> EventPublisher:
    """Create an event publisher with Redis connection."""
    redis_client = redis.Redis.from_url(config.redis_url)
    return EventPublisher(redis_client)
