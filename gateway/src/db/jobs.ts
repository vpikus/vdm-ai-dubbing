import { ulid } from 'ulid';
import { getDatabase, queryOne, queryAll, runQuery, transaction } from './database.js';
import type {
  Job,
  JobStatus,
  CreateJobRequest,
  Media,
  JobEvent,
  EventType,
  FormatPreset,
  OutputContainer,
} from '../../types/index.js';
import { config } from '../config.js';

// =============================================================================
// DATABASE ROW TYPES (snake_case from SQLite)
// =============================================================================

interface JobRow {
  id: string;
  url: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  requested_dubbing: number;
  target_lang: string;
  use_lively_voice: number;
  format_preset: string;
  output_container: string;
  download_subtitles: number;
  priority: number;
  status: string;
  retries: number;
  error: string | null;
}

interface MediaRow {
  id: number;
  job_id: string;
  video_path: string | null;
  audio_original_path: string | null;
  audio_dubbed_path: string | null;
  audio_mixed_path: string | null;
  temp_dir: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  file_size_bytes: number | null;
  source_id: string | null;
  source_title: string | null;
  source_uploader: string | null;
  source_upload_date: string | null;
  source_description: string | null;
  source_thumbnail_url: string | null;
}

interface JobEventRow {
  id: number;
  job_id: string;
  ts: string;
  event: string;
  payload: string | null;
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapJobRow(row: JobRow): Job {
  return {
    id: row.id,
    url: row.url,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    requestedDubbing: row.requested_dubbing === 1,
    targetLang: row.target_lang,
    useLivelyVoice: row.use_lively_voice === 1,
    formatPreset: row.format_preset as FormatPreset,
    outputContainer: row.output_container as OutputContainer,
    downloadSubtitles: row.download_subtitles === 1,
    priority: row.priority,
    status: row.status as JobStatus,
    retries: row.retries,
    error: row.error ?? undefined,
  };
}

function mapMediaRow(row: MediaRow): Media {
  return {
    id: row.id,
    jobId: row.job_id,
    videoPath: row.video_path ?? undefined,
    audioOriginalPath: row.audio_original_path ?? undefined,
    audioDubbedPath: row.audio_dubbed_path ?? undefined,
    audioMixedPath: row.audio_mixed_path ?? undefined,
    tempDir: row.temp_dir ?? undefined,
    durationSec: row.duration_sec ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    fps: row.fps ?? undefined,
    videoCodec: row.video_codec ?? undefined,
    audioCodec: row.audio_codec ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    sourceId: row.source_id ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourceUploader: row.source_uploader ?? undefined,
    sourceUploadDate: row.source_upload_date ?? undefined,
    sourceDescription: row.source_description ?? undefined,
    sourceThumbnailUrl: row.source_thumbnail_url ?? undefined,
  };
}

function mapEventRow(row: JobEventRow): JobEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    ts: new Date(row.ts),
    event: row.event as EventType,
    payload: row.payload ? JSON.parse(row.payload) : undefined,
  };
}

// =============================================================================
// JOB OPERATIONS
// =============================================================================

export function createJob(request: CreateJobRequest): Job {
  const id = ulid();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO jobs (
      id, url, created_at, updated_at,
      requested_dubbing, target_lang, use_lively_voice, format_preset, output_container,
      download_subtitles, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED')
  `;

  runQuery(sql, [
    id,
    request.url,
    now,
    now,
    request.requestedDubbing ? 1 : 0,
    request.targetLang ?? config.defaultTargetLang,
    request.useLivelyVoice ? 1 : 0,
    request.formatPreset ?? config.defaultFormatPreset,
    request.outputContainer ?? config.defaultContainer,
    request.downloadSubtitles ? 1 : 0,
    request.priority ?? 0,
  ]);

  // Create empty media record
  runQuery('INSERT INTO media (job_id) VALUES (?)', [id]);

  return getJobById(id)!;
}

export function getJobById(id: string): Job | undefined {
  const row = queryOne<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
  return row ? mapJobRow(row) : undefined;
}

export function listJobs(options: {
  status?: JobStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): { jobs: Job[]; total: number } {
  const { status, search, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(url LIKE ? OR id LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
    params
  );
  const total = countRow?.count ?? 0;

  // Get paginated results
  const rows = queryAll<JobRow>(
    `SELECT * FROM jobs ${whereClause} ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    jobs: rows.map(mapJobRow),
    total,
  };
}

export function updateJobStatus(id: string, status: JobStatus, error?: string): void {
  if (error) {
    // Set error when provided (typically for FAILED status)
    runQuery('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?', [status, error, new Date().toISOString(), id]);
  } else {
    // Clear error when transitioning to any non-error state (retry, resume, or completion)
    runQuery('UPDATE jobs SET status = ?, error = NULL, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  }
}

export function incrementJobRetries(id: string): number {
  runQuery('UPDATE jobs SET retries = retries + 1 WHERE id = ?', [id]);
  const row = queryOne<{ retries: number }>('SELECT retries FROM jobs WHERE id = ?', [id]);
  return row?.retries ?? 0;
}

export function updateJobPriority(id: string, priority: number): void {
  runQuery('UPDATE jobs SET priority = ? WHERE id = ?', [priority, id]);
}

export function deleteJob(id: string): boolean {
  const result = runQuery('DELETE FROM jobs WHERE id = ?', [id]);
  return result.changes > 0;
}

// =============================================================================
// MEDIA OPERATIONS
// =============================================================================

export function getMediaByJobId(jobId: string): Media | undefined {
  const row = queryOne<MediaRow>('SELECT * FROM media WHERE job_id = ?', [jobId]);
  return row ? mapMediaRow(row) : undefined;
}

export function updateMedia(
  jobId: string,
  updates: Partial<Omit<Media, 'id' | 'jobId'>>
): void {
  const db = getDatabase();

  const columns: string[] = [];
  const values: unknown[] = [];

  const columnMap: Record<string, string> = {
    videoPath: 'video_path',
    audioOriginalPath: 'audio_original_path',
    audioDubbedPath: 'audio_dubbed_path',
    audioMixedPath: 'audio_mixed_path',
    tempDir: 'temp_dir',
    durationSec: 'duration_sec',
    width: 'width',
    height: 'height',
    fps: 'fps',
    videoCodec: 'video_codec',
    audioCodec: 'audio_codec',
    fileSizeBytes: 'file_size_bytes',
    sourceId: 'source_id',
    sourceTitle: 'source_title',
    sourceUploader: 'source_uploader',
    sourceUploadDate: 'source_upload_date',
    sourceDescription: 'source_description',
    sourceThumbnailUrl: 'source_thumbnail_url',
  };

  for (const [key, value] of Object.entries(updates)) {
    const column = columnMap[key];
    if (column && value !== undefined) {
      columns.push(`${column} = ?`);
      values.push(value);
    }
  }

  if (columns.length === 0) return;

  values.push(jobId);

  db.prepare(`UPDATE media SET ${columns.join(', ')} WHERE job_id = ?`).run(...values);
}

// =============================================================================
// EVENT OPERATIONS
// =============================================================================

export function logJobEvent(
  jobId: string,
  event: EventType,
  payload?: Record<string, unknown>
): void {
  runQuery('INSERT INTO job_events (job_id, ts, event, payload) VALUES (?, ?, ?, ?)', [
    jobId,
    new Date().toISOString(),
    event,
    payload ? JSON.stringify(payload) : null,
  ]);
}

export function getJobEvents(
  jobId: string,
  options: { limit?: number; offset?: number } = {}
): { events: JobEvent[]; total: number } {
  const { limit = 100, offset = 0 } = options;

  const countRow = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM job_events WHERE job_id = ?',
    [jobId]
  );
  const total = countRow?.count ?? 0;

  const rows = queryAll<JobEventRow>(
    'SELECT * FROM job_events WHERE job_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?',
    [jobId, limit, offset]
  );

  return {
    events: rows.map(mapEventRow),
    total,
  };
}

// =============================================================================
// TRANSACTION HELPERS
// =============================================================================

export function createJobWithEvents(request: CreateJobRequest): Job {
  return transaction(() => {
    const job = createJob(request);
    logJobEvent(job.id, 'started', { url: request.url });
    return job;
  });
}
