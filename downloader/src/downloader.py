"""yt-dlp wrapper for video downloading."""

import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Callable

import structlog
import yt_dlp

from .config import config
from .events import EventPublisher
from .types import DownloadJobData, MediaMetadata

logger = structlog.get_logger(__name__)


def sanitize_filename(name: str, max_length: int = 200) -> str:
    """Sanitize a string for use as a filename."""
    # Replace problematic characters with safe alternatives
    replacements = {
        "/": "-",
        "\\": "-",
        ":": " -",
        "*": "",
        "?": "",
        '"': "'",
        "<": "",
        ">": "",
        "|": "-",
        "\n": " ",
        "\r": "",
        "\t": " ",
    }
    for char, replacement in replacements.items():
        name = name.replace(char, replacement)

    # Remove leading/trailing whitespace and dots
    name = name.strip().strip(".")

    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name)

    # Truncate if too long (leave room for extension)
    if len(name) > max_length:
        name = name[:max_length].strip()

    return name or "untitled"


class YtDlpLogger:
    """Custom logger for yt-dlp that forwards messages to the event publisher."""

    def __init__(self, event_publisher: EventPublisher, job_id: str):
        self.event_publisher = event_publisher
        self.job_id = job_id

    def debug(self, msg: str) -> None:
        """Handle debug messages from yt-dlp."""
        # Skip verbose debug messages
        if msg.startswith("[debug]"):
            return
        # Skip download progress spam (handled by progress_hooks)
        if "[download]" in msg and ("%" in msg or "ETA" in msg or "MiB" in msg or "KiB" in msg):
            return
        if "Downloading f" in msg or "frag " in msg.lower():
            return
        # Forward other messages
        self.event_publisher.publish_log(self.job_id, "debug", msg)

    def info(self, msg: str) -> None:
        """Handle info messages from yt-dlp."""
        # Skip download progress spam
        if "[download]" in msg and ("%" in msg or "ETA" in msg or "MiB" in msg or "KiB" in msg):
            return
        if "Downloading f" in msg or "frag " in msg.lower():
            return
        self.event_publisher.publish_log(self.job_id, "info", msg)

    def warning(self, msg: str) -> None:
        """Handle warning messages from yt-dlp."""
        self.event_publisher.publish_log(self.job_id, "warning", msg)

    def error(self, msg: str) -> None:
        """Handle error messages from yt-dlp."""
        self.event_publisher.publish_log(self.job_id, "error", msg)


class VideoDownloader:
    """Downloads videos using yt-dlp with progress tracking."""

    def __init__(self, event_publisher: EventPublisher):
        self.event_publisher = event_publisher
        self._current_job_id: str | None = None
        self._yt_logger: YtDlpLogger | None = None

    def download(self, job: DownloadJobData) -> tuple[str, MediaMetadata]:
        """
        Download a video and return the output path and metadata.

        Args:
            job: Download job data from queue

        Returns:
            Tuple of (output_path, metadata)

        Raises:
            DownloadError: If download fails
        """
        self._current_job_id = job.job_id
        self._yt_logger = YtDlpLogger(self.event_publisher, job.job_id)
        log = logger.bind(job_id=job.job_id, url=job.url)

        # Create temp directory
        temp_dir = Path(job.temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        # Build output template
        output_template = str(temp_dir / "%(id)s.%(ext)s")

        # Build yt-dlp options
        ydl_opts = self._build_options(job, output_template, self._yt_logger)

        log.info("Starting download", format=job.format_preset)
        self.event_publisher.publish_log(job.job_id, "info", f"Starting download: {job.url}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract info first
                log.debug("Extracting video info")
                info = ydl.extract_info(job.url, download=False)

                if info is None:
                    raise DownloadError("Failed to extract video info")

                time.sleep(4)

                # Download the video
                log.info("Downloading video", title=info.get("title"))
                ydl.download([job.url])

                # Get the actual output file
                output_path = self._find_output_file(temp_dir, info)

                if not output_path:
                    raise DownloadError("Downloaded file not found")

                # Extract metadata
                metadata = self._extract_metadata(info)

                # Move to final location if not dubbing
                if not job.requested_dubbing:
                    # Generate proper filename: "Title [source_id].ext"
                    title = sanitize_filename(metadata.source_title or "untitled")
                    source_id = metadata.source_id or job.job_id
                    ext = job.output_container
                    filename = f"{title} [{source_id}].{ext}"

                    final_dir = Path(job.final_path).parent
                    final_dir.mkdir(parents=True, exist_ok=True)
                    final_path = final_dir / filename

                    # Handle duplicate filenames
                    counter = 1
                    base_final_path = final_path
                    while final_path.exists():
                        filename = f"{title} [{source_id}] ({counter}).{ext}"
                        final_path = final_dir / filename
                        counter += 1

                    log.info("Moving file to complete", src=str(output_path), dst=str(final_path))
                    shutil.move(str(output_path), str(final_path))
                    output_path = final_path

                    # Clean up temp directory after successful move
                    self._cleanup_temp_dir(temp_dir, log)

                log.info(
                    "Download complete",
                    output=str(output_path),
                    size=output_path.stat().st_size,
                )
                self.event_publisher.publish_log(job.job_id, "info", "Download complete")

                return str(output_path), metadata

        except yt_dlp.utils.DownloadError as e:
            error_msg = str(e)
            log.error("Download failed", error=error_msg)
            raise DownloadError(error_msg, retryable=self._is_retryable_error(error_msg))

        except Exception as e:
            log.error("Unexpected error during download", error=str(e))
            raise DownloadError(str(e), retryable=False)

        finally:
            self._current_job_id = None
            self._yt_logger = None

    def _build_options(self, job: DownloadJobData, output_template: str, yt_logger: YtDlpLogger) -> dict[str, Any]:
        """Build yt-dlp options dictionary."""
        opts: dict[str, Any] = {
            "outtmpl": output_template,
            "merge_output_format": job.output_container,
            "progress_hooks": [self._progress_hook],
            "postprocessor_hooks": [self._postprocessor_hook],
            "logger": yt_logger,
            "quiet": False,
            "no_warnings": False,
            "ignoreerrors": False,
            # Retry settings for transient errors (403, timeouts, etc.)
            "retries": 10,
            "fragment_retries": 10,
            "extractor_retries": 5,
            "file_access_retries": 3,
            "socket_timeout": 30,
        }

        # Only set format for specific presets (best, bestaudio, worst).
        # For "bestvideo+bestaudio" (Best Quality), let yt-dlp use its intelligent
        # default from _default_format_spec() which handles:
        # - Live streams (uses prefer_best)
        # - Missing ffmpeg (falls back to single file)
        # - Multiple audio streams compat mode
        if job.format_preset and job.format_preset != "bestvideo+bestaudio":
            opts["format"] = job.format_preset

        # Format sorting preferences - prefer h264/aac for better mp4 compatibility
        opts["format_sort"] = ["vcodec:h264", "lang", "quality", "res", "fps", "hdr:12", "acodec:aac"]

        # Add subtitles if requested
        if job.download_subtitles:
            opts["writesubtitles"] = True
            opts["subtitleslangs"] = ["en", "ru", "all"]
            opts["subtitlesformat"] = "best"

        # Add proxy if configured
        proxy = job.proxy or config.proxy
        if proxy:
            opts["proxy"] = proxy

        # Add cookies if provided in job and file has actual cookie data
        if job.cookies_file and os.path.exists(job.cookies_file) and self._has_valid_cookies(job.cookies_file):
            opts["cookiefile"] = job.cookies_file

        # Add rate limit if configured
        rate_limit = job.rate_limit or config.rate_limit
        if rate_limit:
            opts["ratelimit"] = self._parse_rate_limit(rate_limit)

        return opts

    def _progress_hook(self, d: dict[str, Any]) -> None:
        """Progress hook called by yt-dlp during download."""
        if not self._current_job_id:
            return

        status = d.get("status")

        if status == "downloading":
            # Calculate progress
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)

            percent = 0.0
            if total and total > 0:
                percent = (downloaded / total) * 100

            self.event_publisher.publish_progress(
                job_id=self._current_job_id,
                stage="downloading",
                percent=round(percent, 2),
                downloaded_bytes=downloaded,
                total_bytes=total,
                speed=d.get("speed"),
                eta=d.get("eta"),
            )

        elif status == "finished":
            self.event_publisher.publish_progress(
                job_id=self._current_job_id,
                stage="downloading",
                percent=100.0,
            )

        elif status == "error":
            self.event_publisher.publish_log(
                self._current_job_id, "error", f"Download error: {d.get('error', 'Unknown')}"
            )

    def _postprocessor_hook(self, d: dict[str, Any]) -> None:
        """Postprocessor hook called by yt-dlp during post-processing."""
        if not self._current_job_id:
            return

        status = d.get("status")
        postprocessor = d.get("postprocessor", "unknown")

        if status == "started":
            self.event_publisher.publish_log(self._current_job_id, "info", f"Post-processing: {postprocessor}")
        elif status == "finished":
            self.event_publisher.publish_log(self._current_job_id, "info", f"Post-processing complete: {postprocessor}")

    def _find_output_file(self, temp_dir: Path, info: dict[str, Any]) -> Path | None:
        """Find the downloaded output file in temp directory."""
        video_id = info.get("id", "")

        # Look for files matching the video ID
        for file in temp_dir.iterdir():
            if file.is_file() and video_id in file.name:
                return file

        # Fallback: return the first video file found
        for file in temp_dir.iterdir():
            if file.is_file() and file.suffix.lower() in [".mkv", ".mp4", ".webm", ".mp3", ".m4a"]:
                return file

        return None

    def _extract_metadata(self, info: dict[str, Any]) -> MediaMetadata:
        """Extract metadata from yt-dlp info dict."""
        return MediaMetadata(
            source_id=info.get("id", ""),
            source_title=info.get("title", "Unknown"),
            source_uploader=info.get("uploader") or info.get("channel"),
            source_upload_date=info.get("upload_date"),
            source_description=info.get("description"),
            source_thumbnail_url=info.get("thumbnail"),
            duration_sec=info.get("duration"),
            width=info.get("width"),
            height=info.get("height"),
            fps=info.get("fps"),
            video_codec=info.get("vcodec"),
            audio_codec=info.get("acodec"),
        )

    def _cleanup_temp_dir(self, temp_dir: Path, log: Any) -> None:
        """Clean up temporary directory after successful download."""
        try:
            if temp_dir.exists() and temp_dir.is_dir():
                shutil.rmtree(temp_dir)
                log.info("Cleaned up temp directory", path=str(temp_dir))
        except Exception as e:
            # Don't fail the job if cleanup fails, just log the error
            log.warning("Failed to clean up temp directory", path=str(temp_dir), error=str(e))

    def _parse_rate_limit(self, rate_limit: str) -> int | None:
        """Parse rate limit string (e.g., '50K', '1M') to bytes per second."""
        if not rate_limit:
            return None

        rate_limit = rate_limit.strip().upper()

        multipliers = {
            "K": 1024,
            "M": 1024 * 1024,
            "G": 1024 * 1024 * 1024,
        }

        for suffix, multiplier in multipliers.items():
            if rate_limit.endswith(suffix):
                try:
                    value = float(rate_limit[:-1])
                    return int(value * multiplier)
                except ValueError:
                    return None

        try:
            return int(rate_limit)
        except ValueError:
            return None

    def _is_retryable_error(self, error: str) -> bool:
        """Determine if an error is retryable."""
        retryable_patterns = [
            "network",
            "timeout",
            "connection",
            "temporary",
            "unavailable",
            "rate limit",
            "429",
            "503",
            "502",
        ]

        error_lower = error.lower()
        return any(pattern in error_lower for pattern in retryable_patterns)

    def _has_valid_cookies(self, cookies_file: str) -> bool:
        """Check if cookies file contains actual cookie data (not just comments)."""
        try:
            with open(cookies_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    # Skip empty lines and comments
                    if not line or line.startswith("#"):
                        continue
                    # Found a non-comment, non-empty line - likely a cookie entry
                    return True
            return False
        except Exception:
            return False


class DownloadError(Exception):
    """Exception raised when download fails."""

    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable
