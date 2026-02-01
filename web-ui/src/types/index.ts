/**
 * Type definitions for Web UI
 */

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

export type OutputContainer = 'mkv' | 'mp4' | 'webm';

export type FormatPreset =
  | 'bestvideo+bestaudio'
  | 'best'
  | 'bestaudio'
  | 'worst';

export interface Job {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  requestedDubbing: boolean;
  targetLang: string;
  useLivelyVoice: boolean;
  formatPreset: FormatPreset;
  outputContainer: OutputContainer;
  downloadSubtitles: boolean;
  priority: number;
  status: JobStatus;
  retries: number;
  error?: string;
}

export interface Media {
  id: number;
  jobId: string;
  videoPath?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  sourceTitle?: string;
  sourceUploader?: string;
  fileSizeBytes?: number;
}

export interface JobEvent {
  id: number;
  jobId: string;
  ts: string;
  event: string;
  payload?: Record<string, unknown>;
}

export interface JobDetail extends Job {
  media?: Media;
  events?: JobEvent[];
}

export interface ProgressPayload {
  stage: string;
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

export interface CreateJobRequest {
  url: string;
  requestedDubbing?: boolean;
  targetLang?: string;
  useLivelyVoice?: boolean;
  formatPreset?: FormatPreset;
  outputContainer?: OutputContainer;
  downloadSubtitles?: boolean;
  priority?: number;
  cookies?: string; // Optional Netscape format cookies for authenticated downloads
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export interface User {
  id: number;
  username: string;
  role: string;
}
