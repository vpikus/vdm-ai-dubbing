"""FFmpeg-based audio mixing and muxing."""

import json
import shutil
import subprocess
from pathlib import Path

import structlog

from .events import EventPublisher
from .types import MuxJobData

logger = structlog.get_logger(__name__)


class AudioMuxer:
    """Mixes and muxes audio tracks using FFmpeg."""

    def __init__(self, event_publisher: EventPublisher):
        self.event_publisher = event_publisher

    def _has_audio_stream(self, video_path: str) -> bool:
        """Check if video file has at least one audio stream."""
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-select_streams",
            "a",
            video_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, check=True)
            data = json.loads(result.stdout)
            return len(data.get("streams", [])) > 0
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            raise MuxingError(f"Failed to probe video file: {error_msg}") from e
        except json.JSONDecodeError as e:
            raise MuxingError(f"Failed to parse ffprobe output: {e}") from e

    def process(self, job: MuxJobData) -> str:
        """
        Process a muxing job: mix audio tracks and create final video.

        Args:
            job: Muxing job data

        Returns:
            Path to the final output file

        Raises:
            MuxingError: If muxing fails
        """
        log = logger.bind(job_id=job.job_id)
        log.info("Starting muxing process", video=job.video_path)

        self.event_publisher.publish_log(job.job_id, "info", "Starting audio mixing and muxing")

        # Validate input files
        if not Path(job.video_path).exists():
            raise MuxingError(f"Video file not found: {job.video_path}")

        if not Path(job.audio_dubbed_path).exists():
            raise MuxingError(f"Dubbed audio file not found: {job.audio_dubbed_path}")

        # Create temp directory for intermediate files
        temp_dir = Path(job.temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Validate video has audio stream before attempting extraction
            if not self._has_audio_stream(job.video_path):
                raise MuxingError(f"Video file has no audio stream: {job.video_path}")

            # Step 1: Extract original audio from video
            log.info("Extracting original audio")
            self.event_publisher.publish_progress(job.job_id, "mixing", 10)
            original_audio_path = temp_dir / "original_audio.wav"
            self._extract_audio(job.video_path, str(original_audio_path))

            # Step 2: Mix original and dubbed audio with ducking
            log.info("Mixing audio tracks with ducking")
            self.event_publisher.publish_progress(job.job_id, "mixing", 30)
            mixed_audio_path = temp_dir / "mixed_audio.wav"
            self._mix_audio_with_ducking(
                str(original_audio_path),
                job.audio_dubbed_path,
                str(mixed_audio_path),
                job.ducking_level,
            )

            # Step 3: Create final video with multiple audio tracks
            log.info("Muxing audio tracks into video")
            self.event_publisher.publish_progress(job.job_id, "muxing", 60)

            # Ensure output directory exists
            output_path = Path(job.final_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Create temp output file
            temp_output = temp_dir / f"output.{job.output_container}"

            self._mux_video(
                job.video_path,
                str(original_audio_path),
                str(mixed_audio_path),
                str(temp_output),
                job.target_lang,
            )

            # Step 4: Move to final location
            log.info("Moving to final location", dst=job.final_path)
            self.event_publisher.publish_progress(job.job_id, "muxing", 90)
            shutil.move(str(temp_output), job.final_path)

            self.event_publisher.publish_progress(job.job_id, "muxing", 100)
            self.event_publisher.publish_log(job.job_id, "info", "Muxing complete")

            log.info("Muxing complete", output=job.final_path)
            return job.final_path

        except subprocess.CalledProcessError as e:
            error_msg = f"FFmpeg failed: {e.stderr.decode() if e.stderr else str(e)}"
            log.error("FFmpeg error", error=error_msg)
            raise MuxingError(error_msg) from e

        except Exception as e:
            log.error("Muxing failed", error=str(e))
            raise MuxingError(str(e)) from e

    def _extract_audio(self, video_path: str, output_path: str) -> None:
        """Extract audio from video file."""
        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output
            "-i",
            video_path,
            "-vn",  # No video
            "-ac",
            "2",  # Stereo
            "-ar",
            "48000",  # 48kHz
            "-c:a",
            "pcm_s16le",  # 16-bit PCM
            output_path,
        ]

        subprocess.run(cmd, capture_output=True, check=True)
        logger.debug("Audio extraction complete", output=output_path)

    def _mix_audio_with_ducking(
        self,
        original_path: str,
        dubbed_path: str,
        output_path: str,
        ducking_level: float,
    ) -> None:
        """
        Mix original and dubbed audio with ducking.

        The original audio volume is reduced when dubbed audio is present.
        """
        # Simple ducking: reduce original volume and mix with dubbed
        # For more sophisticated ducking, use sidechain compression
        filter_complex = (
            f"[0:a]volume={ducking_level}[orig];"
            f"[1:a]volume=1.0[dub];"
            f"[orig][dub]amix=inputs=2:duration=longest:normalize=0[out]"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            original_path,
            "-i",
            dubbed_path,
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-c:a",
            "pcm_s16le",
            output_path,
        ]

        subprocess.run(cmd, capture_output=True, check=True)
        logger.debug("Audio mixing complete", output=output_path)

    def _mux_video(
        self,
        video_path: str,
        original_audio_path: str,
        mixed_audio_path: str,
        output_path: str,
        target_lang: str,
    ) -> None:
        """
        Mux video with multiple audio tracks.

        Creates a video file with:
        - Original video stream (copied, no re-encoding)
        - Original audio as track 0
        - Mixed/dubbed audio as track 1 (default)
        """
        # Get the language code for metadata
        lang_map = {
            "ru": "rus",
            "en": "eng",
            "es": "spa",
            "de": "deu",
            "fr": "fra",
            "it": "ita",
            "pt": "por",
            "ja": "jpn",
            "ko": "kor",
            "zh": "zho",
        }
        lang_code = lang_map.get(target_lang, target_lang)

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            video_path,  # Input 0: original video (for video stream)
            "-i",
            original_audio_path,  # Input 1: original audio
            "-i",
            mixed_audio_path,  # Input 2: mixed/dubbed audio
            # Map video from input 0
            "-map",
            "0:v",
            # Map original audio from input 1
            "-map",
            "1:a",
            # Map dubbed audio from input 2
            "-map",
            "2:a",
            # Copy video stream (no re-encoding)
            "-c:v",
            "copy",
            # Encode audio as AAC
            "-c:a:0",
            "aac",
            "-c:a:1",
            "aac",
            # Set audio bitrate
            "-b:a:0",
            "192k",
            "-b:a:1",
            "192k",
            # Metadata for original audio track
            "-metadata:s:a:0",
            "language=und",
            "-metadata:s:a:0",
            "title=Original",
            # Metadata for dubbed audio track
            "-metadata:s:a:1",
            f"language={lang_code}",
            "-metadata:s:a:1",
            "title=Dubbed",
            # Set dubbed track as default
            "-disposition:a:0",
            "0",
            "-disposition:a:1",
            "default",
            output_path,
        ]

        subprocess.run(cmd, capture_output=True, check=True)
        logger.debug("Video muxing complete", output=output_path)


class MuxingError(Exception):
    """Exception raised when muxing fails."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable
