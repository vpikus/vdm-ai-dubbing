import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'fs';
import { publishLog, publishProgress } from './events.js';

/**
 * Extract audio from video file and convert to mono 16kHz WAV.
 * This format is required by the VOT API.
 */
export async function extractAudio(
  jobId: string,
  videoPath: string,
  outputPath: string
): Promise<void> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  await publishLog(jobId, 'info', 'Extracting audio from video...');

  return new Promise((resolve, reject) => {
    let lastProgress = 0;

    ffmpeg(videoPath)
      .noVideo()
      .audioChannels(1) // Mono
      .audioFrequency(16000) // 16kHz
      .audioCodec('pcm_s16le') // 16-bit PCM
      .format('wav')
      .on('start', (commandLine: string) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress: { percent?: number }) => {
        const percent = Math.round(progress.percent || 0);
        if (percent !== lastProgress && percent % 10 === 0) {
          lastProgress = percent;
          publishProgress(jobId, 'extracting', percent).catch(console.error);
        }
      })
      .on('end', () => {
        publishProgress(jobId, 'extracting', 100).catch(console.error);
        publishLog(jobId, 'info', 'Audio extraction complete').catch(console.error);
        resolve();
      })
      .on('error', (err: Error) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Get audio duration in seconds.
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe audio: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration;
      if (typeof duration !== 'number') {
        reject(new Error('Could not determine audio duration'));
        return;
      }

      resolve(duration);
    });
  });
}
