"""Type definitions for Download Worker."""

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any


class JobStatus(StrEnum):
    """Job status values."""

    QUEUED = "QUEUED"
    DOWNLOADING = "DOWNLOADING"
    DOWNLOADED = "DOWNLOADED"
    DUBBING = "DUBBING"
    DUBBED = "DUBBED"
    MUXING = "MUXING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class FormatPreset(StrEnum):
    """Format preset values for yt-dlp."""

    BESTVIDEO_BESTAUDIO = "bestvideo+bestaudio"
    BEST = "best"
    BESTAUDIO = "bestaudio"
    WORST = "worst"


class OutputContainer(StrEnum):
    """Output container formats."""

    MKV = "mkv"
    MP4 = "mp4"
    WEBM = "webm"


@dataclass
class DownloadJobData:
    """Download job data from queue."""

    job_id: str
    url: str
    format_preset: str
    output_container: str
    requested_dubbing: bool
    target_lang: str
    use_lively_voice: bool
    download_subtitles: bool
    temp_dir: str
    final_path: str
    proxy: str | None = None
    cookies_file: str | None = None
    rate_limit: str | None = None


@dataclass
class ProgressPayload:
    """Progress event payload."""

    stage: str  # downloading, extracting, etc.
    percent: float
    downloaded_bytes: int | None = None
    total_bytes: int | None = None
    speed: float | None = None  # bytes per second
    eta: int | None = None  # seconds


@dataclass
class StateChangePayload:
    """State change event payload."""

    from_status: str
    to_status: str


@dataclass
class LogPayload:
    """Log event payload."""

    level: str  # debug, info, warn, error
    message: str


@dataclass
class ErrorPayload:
    """Error event payload."""

    code: str
    message: str
    retryable: bool
    stack: str | None = None


@dataclass
class EventMessage:
    """Base event message for Pub/Sub."""

    job_id: str
    type: str  # progress, state_change, log, error
    timestamp: str
    payload: dict[str, Any]

    @classmethod
    def create(cls, job_id: str, event_type: str, payload: dict[str, Any]) -> "EventMessage":
        """Create a new event message."""
        return cls(
            job_id=job_id,
            type=event_type,
            timestamp=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            payload=payload,
        )


@dataclass
class MediaMetadata:
    """Extracted media metadata."""

    source_id: str
    source_title: str
    source_uploader: str | None
    source_upload_date: str | None
    source_description: str | None
    source_thumbnail_url: str | None
    duration_sec: float | None
    width: int | None
    height: int | None
    fps: float | None
    video_codec: str | None
    audio_codec: str | None
