"""Redis Pub/Sub event publishing for Muxing Worker."""

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

    def publish_progress(self, job_id: str, stage: str, percent: float) -> None:
        """Publish a progress event."""
        payload: dict[str, Any] = {
            "stage": stage,
            "percent": percent,
        }
        message = EventMessage.create(job_id, "progress", payload)
        self.publish("events:progress", message)

    def publish_state_change(self, job_id: str, from_status: str, to_status: str) -> None:
        """Publish a state change event."""
        payload = {"from": from_status, "to": to_status}
        message = EventMessage.create(job_id, "state_change", payload)
        self.publish("events:state", message)

    def publish_log(self, job_id: str, level: str, log_message: str) -> None:
        """Publish a log event."""
        payload = {"level": level, "message": log_message}
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


def create_event_publisher() -> EventPublisher:
    """Create an event publisher with Redis connection."""
    redis_client = redis.Redis.from_url(config.redis_url)
    return EventPublisher(redis_client)
