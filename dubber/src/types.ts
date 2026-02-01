/**
 * Type definitions for Dubbing Worker.
 */

export interface DubJobData {
  jobId: string;
  url: string; // Original video URL for VOT.js API
  videoPath: string;
  targetLang: string;
  useLivelyVoice: boolean; // Use Yandex lively voice feature
  tempDir: string;
  outputPath: string;
  finalPath: string; // Final output path for muxer
  outputContainer: string; // Output container format (mkv, mp4, etc.)
}

export interface MuxJobData {
  jobId: string;
  videoPath: string;
  audioDubbedPath: string;
  targetLang: string;
  outputContainer: string;
  duckingLevel: number;
  normalizationLufs: number;
  tempDir: string;
  finalPath: string;
}

export interface EventMessage<T = unknown> {
  jobId: string;
  type: string;
  timestamp: string;
  payload: T;
}

export interface ProgressPayload {
  stage: string;
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

export interface StateChangePayload {
  from: string;
  to: string;
}

export interface LogPayload {
  level: string;
  message: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  stack?: string;
}

export type JobStatus =
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'DUBBING'
  | 'DUBBED'
  | 'MUXING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELED';
