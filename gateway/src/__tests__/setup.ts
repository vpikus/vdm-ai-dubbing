/**
 * Test setup file
 */

import { afterAll, beforeAll } from 'vitest';
import { getDatabase, closeDatabase } from '../db/database';
import { closeQueues, closeRedisConnections } from '../queue/client';

const SCHEMA_SQL = `
-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  requested_dubbing INTEGER NOT NULL DEFAULT 0,
  target_lang TEXT NOT NULL DEFAULT 'ru',
  format_preset TEXT DEFAULT 'bestvideo+bestaudio',
  output_container TEXT DEFAULT 'mkv',
  download_subtitles INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  retries INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

-- Media table
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  video_path TEXT,
  audio_original_path TEXT,
  audio_dubbed_path TEXT,
  audio_mixed_path TEXT,
  temp_dir TEXT,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  video_codec TEXT,
  audio_codec TEXT,
  file_size_bytes INTEGER,
  source_id TEXT,
  source_title TEXT,
  source_uploader TEXT,
  source_upload_date TEXT,
  source_description TEXT,
  source_thumbnail_url TEXT,
  UNIQUE(job_id)
);

-- Job events table
CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event TEXT NOT NULL,
  payload TEXT
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id);
CREATE INDEX IF NOT EXISTS idx_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`;

beforeAll(() => {
  // Initialize database and run schema
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
});

afterAll(async () => {
  closeDatabase();
  await closeQueues();
  await closeRedisConnections();
});
