"""Type definitions for Download Worker."""

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class JobStatus(str, Enum):
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


class FormatPreset(str, Enum):
    """Format preset values for yt-dlp."""

    BESTVIDEO_BESTAUDIO = "bestvideo+bestaudio"
    BEST = "best"
    BESTAUDIO = "bestaudio"
    WORST = "worst"


class OutputContainer(str, Enum):
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
    proxy: Optional[str] = None
    cookies_file: Optional[str] = None
    rate_limit: Optional[str] = None


@dataclass
class ProgressPayload:
    """Progress event payload."""

    stage: str  # downloading, extracting, etc.
    percent: float
    downloaded_bytes: Optional[int] = None
    total_bytes: Optional[int] = None
    speed: Optional[float] = None  # bytes per second
    eta: Optional[int] = None  # seconds


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
    stack: Optional[str] = None


@dataclass
class EventMessage:
    """Base event message for Pub/Sub."""

    job_id: str
    type: str  # progress, state_change, log, error
    timestamp: str
    payload: dict

    @classmethod
    def create(cls, job_id: str, event_type: str, payload: dict) -> "EventMessage":
        """Create a new event message."""
        return cls(
            job_id=job_id,
            type=event_type,
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            payload=payload,
        )


@dataclass
class MediaMetadata:
    """Extracted media metadata."""

    source_id: str
    source_title: str
    source_uploader: Optional[str]
    source_upload_date: Optional[str]
    source_description: Optional[str]
    source_thumbnail_url: Optional[str]
    duration_sec: Optional[float]
    width: Optional[int]
    height: Optional[int]
    fps: Optional[float]
    video_codec: Optional[str]
    audio_codec: Optional[str]
