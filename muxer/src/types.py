"""Type definitions for Muxing Worker."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class MuxJobData:
    """Muxing job data from queue."""

    job_id: str
    video_path: str
    audio_dubbed_path: str
    target_lang: str
    output_container: str
    ducking_level: float
    normalization_lufs: float  # TODO: Implement audio normalization in muxer
    temp_dir: str
    final_path: str


@dataclass
class EventMessage:
    """Base event message for Pub/Sub."""

    job_id: str
    type: str
    timestamp: str
    payload: dict[str, Any]

    @classmethod
    def create(cls, job_id: str, event_type: str, payload: dict[str, Any]) -> "EventMessage":
        """Create a new event message."""
        return cls(
            job_id=job_id,
            type=event_type,
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            payload=payload,
        )
