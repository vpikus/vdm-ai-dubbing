/**
 * Shared type definitions for Video Download Manager
 * Used by Gateway, Dubber, and Web UI (TypeScript services)
 */

// =============================================================================
// JOB TYPES
// =============================================================================

/** Job status values matching SQLite constraint */
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

/** Output container formats */
export type OutputContainer = 'mkv' | 'mp4' | 'webm';

/** Format presets for yt-dlp */
export type FormatPreset =
  | 'bestvideo+bestaudio'
  | 'best'
  | 'bestaudio'
  | 'worst';

/** Job record from database */
export interface Job {
  id: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
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

/** Job creation request */
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

/** Job control actions */
export type JobControlAction = 'pause' | 'resume' | 'cancel' | 'prioritize';

export interface JobControlRequest {
  action: JobControlAction;
  priority?: number;
}

/** Job list query parameters */
export interface JobListQuery {
  status?: JobStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Job list response */
export interface JobListResponse {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// MEDIA TYPES
// =============================================================================

/** Media record from database */
export interface Media {
  id: number;
  jobId: string;
  videoPath?: string;
  audioOriginalPath?: string;
  audioDubbedPath?: string;
  audioMixedPath?: string;
  tempDir?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  fileSizeBytes?: number;
  sourceId?: string;
  sourceTitle?: string;
  sourceUploader?: string;
  sourceUploadDate?: string;
  sourceDescription?: string;
  sourceThumbnailUrl?: string;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Event types for Pub/Sub messages.
 * Note: 'metadata' is used only for Pub/Sub, not stored in job_events table.
 * DB-stored event types: progress, state_change, log, error, started, finished, retry
 */
export type EventType =
  | 'progress'
  | 'state_change'
  | 'log'
  | 'error'
  | 'started'
  | 'finished'
  | 'retry'
  | 'metadata';

/** Job event record from database */
export interface JobEvent {
  id: number;
  jobId: string;
  ts: Date;
  event: EventType;
  payload?: Record<string, unknown>;
}

/** Progress event payload */
export interface ProgressPayload {
  stage: 'downloading' | 'extracting' | 'dubbing' | 'mixing' | 'muxing';
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

/** State change event payload */
export interface StateChangePayload {
  from: JobStatus;
  to: JobStatus;
}

/** Log event payload */
export interface LogPayload {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

/** Error event payload */
export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  stack?: string;
}

// =============================================================================
// QUEUE TYPES
// =============================================================================

/** Queue names */
export type QueueName = 'download' | 'dub' | 'mux';

/** Pub/Sub channel names */
export type EventChannel =
  | 'events:progress'
  | 'events:state'
  | 'events:log'
  | 'events:error'
  | 'events:metadata';

/** Base event message for Pub/Sub */
export interface EventMessage<T = unknown> {
  jobId: string;
  type: EventType;
  timestamp: string;
  payload: T;
}

/** Download job data for q:download */
export interface DownloadJobData {
  jobId: string;
  url: string;
  formatPreset: FormatPreset;
  outputContainer: OutputContainer;
  requestedDubbing: boolean;
  targetLang: string;
  useLivelyVoice: boolean;
  downloadSubtitles: boolean;
  tempDir: string;
  finalPath: string;
  proxy?: string;
  cookiesFile?: string;
  rateLimit?: string;
}

/** Dubbing job data for q:dub */
export interface DubJobData {
  jobId: string;
  url: string; // Original video URL for VOT.js API
  videoPath: string;
  targetLang: string;
  useLivelyVoice: boolean; // Use Yandex lively voice feature
  tempDir: string;
  outputPath: string;
  finalPath: string; // Final output path for muxer
  outputContainer: OutputContainer; // Output container format
}

/** Muxing job data for q:mux */
export interface MuxJobData {
  jobId: string;
  videoPath: string;
  audioDubbedPath: string;
  targetLang: string;
  outputContainer: OutputContainer;
  duckingLevel: number;
  normalizationLufs: number;
  tempDir: string;
  finalPath: string;
}

// =============================================================================
// WEBSOCKET TYPES
// =============================================================================

/** WebSocket client-to-server events */
export interface ClientToServerEvents {
  subscribe: (jobIds: string[]) => void;
  unsubscribe: (jobIds: string[]) => void;
  authenticate: (token: string) => void;
}

/** WebSocket server-to-client events */
export interface ServerToClientEvents {
  progress: (data: EventMessage<ProgressPayload>) => void;
  state_change: (data: EventMessage<StateChangePayload>) => void;
  log: (data: EventMessage<LogPayload>) => void;
  error: (data: EventMessage<ErrorPayload>) => void;
  notification: (data: NotificationData) => void;
  job_added: (data: { jobId: string; url: string; status: JobStatus }) => void;
  job_removed: (data: { jobId: string }) => void;
  authenticated: (data: { success: boolean; error?: string }) => void;
}

/** Notification data for WebSocket */
export interface NotificationData {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  jobId?: string;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

/** User record */
export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  createdAt: Date;
  lastLoginAt?: Date;
}

/** Login request */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Login response */
export interface LoginResponse {
  token: string;
  user: Omit<User, 'createdAt' | 'lastLoginAt'>;
}

/** JWT payload */
export interface JWTPayload {
  sub: number;
  username: string;
  role: 'admin' | 'user';
  jti: string;
  iat: number;
  exp: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/** Standard error response */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

/** Health check response */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  dependencies: {
    redis: 'ok' | 'error';
    sqlite: 'ok' | 'error';
    filesystem: 'ok' | 'error';
  };
}

/** Job with media and events for detail view */
export interface JobDetail extends Job {
  media?: Media;
  events?: JobEvent[];
}
