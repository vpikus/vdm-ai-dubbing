-- Video Download Manager Database Schema
-- Version: 1.0.0
-- SQLite 3.40+

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Enable WAL mode for concurrent reads
PRAGMA journal_mode = WAL;

-- Optimize for performance
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -10000;
PRAGMA temp_store = MEMORY;

-- =============================================================================
-- JOBS TABLE
-- =============================================================================
-- Jobs submitted by user for download and optional dubbing
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                    -- UUIDv7 format
    url TEXT NOT NULL,                      -- Source video URL
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,                  -- When job finished (complete/failed/canceled)

    -- Job options
    requested_dubbing INTEGER NOT NULL DEFAULT 0,  -- Boolean: 0 or 1
    target_lang TEXT NOT NULL DEFAULT 'ru',        -- ISO 639-1 language code
    format_preset TEXT DEFAULT 'bestvideo+bestaudio',  -- yt-dlp format string
    output_container TEXT DEFAULT 'mp4',           -- Output container: mkv, mp4, webm
    download_subtitles INTEGER NOT NULL DEFAULT 0, -- Boolean: download subtitles
    priority INTEGER NOT NULL DEFAULT 0,           -- Higher = earlier execution (0-10)

    -- Job state
    status TEXT NOT NULL DEFAULT 'QUEUED',         -- Current state
    retries INTEGER NOT NULL DEFAULT 0,            -- Number of retry attempts
    error TEXT,                                    -- Error message if failed

    -- Constraints
    CHECK (status IN ('QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'DUBBING', 'DUBBED', 'MUXING', 'COMPLETE', 'FAILED', 'CANCELED')),
    CHECK (priority >= 0 AND priority <= 10),
    CHECK (requested_dubbing IN (0, 1)),
    CHECK (download_subtitles IN (0, 1))
);

-- =============================================================================
-- MEDIA TABLE
-- =============================================================================
-- Media artifacts and metadata per job
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

    -- File paths
    video_path TEXT,                        -- Final video container path
    audio_original_path TEXT,               -- Extracted original audio (cache)
    audio_dubbed_path TEXT,                 -- Dubbed audio from dubbing worker
    audio_mixed_path TEXT,                  -- Mixed voice-over audio
    temp_dir TEXT,                          -- Temporary directory for processing

    -- Video metadata
    duration_sec REAL,                      -- Duration in seconds
    width INTEGER,                          -- Video width in pixels
    height INTEGER,                         -- Video height in pixels
    fps REAL,                               -- Frames per second
    video_codec TEXT,                       -- Video codec (e.g., h264, vp9)
    audio_codec TEXT,                       -- Audio codec (e.g., aac, opus)
    file_size_bytes INTEGER,                -- Final file size in bytes

    -- Source metadata
    source_id TEXT,                         -- Video ID from source (e.g., YouTube video ID)
    source_title TEXT,                      -- Original video title
    source_uploader TEXT,                   -- Channel/uploader name
    source_upload_date TEXT,                -- Original upload date
    source_description TEXT,                -- Video description
    source_thumbnail_url TEXT,              -- Thumbnail URL

    -- Unique constraint: one media record per job
    UNIQUE(job_id)
);

-- =============================================================================
-- JOB_EVENTS TABLE
-- =============================================================================
-- Event log for progress tracking, metrics, and debugging
CREATE TABLE IF NOT EXISTS job_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event TEXT NOT NULL,                    -- Event type
    payload TEXT,                           -- JSON payload with event-specific data

    -- Event types: progress, state_change, log, error, started, finished
    CHECK (event IN ('progress', 'state_change', 'log', 'error', 'started', 'finished', 'retry'))
);

-- =============================================================================
-- USERS TABLE (for authentication)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,            -- bcrypt hash
    role TEXT NOT NULL DEFAULT 'user',      -- admin or user
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,

    CHECK (role IN ('admin', 'user'))
);

-- =============================================================================
-- SESSIONS TABLE (for JWT token invalidation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                    -- JWT jti claim
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,     -- Boolean: token revoked

    CHECK (revoked IN (0, 1))
);

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Jobs indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_priority_created ON jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority DESC, created_at ASC);

-- Media indexes
CREATE INDEX IF NOT EXISTS idx_media_job_id ON media(job_id);

-- Job events indexes for log queries
CREATE INDEX IF NOT EXISTS idx_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON job_events(ts);
CREATE INDEX IF NOT EXISTS idx_events_job_ts ON job_events(job_id, ts);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
-- Update updated_at on jobs modification
CREATE TRIGGER IF NOT EXISTS update_jobs_updated_at
    AFTER UPDATE ON jobs
    FOR EACH ROW
BEGIN
    UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Set completed_at when job reaches terminal state
CREATE TRIGGER IF NOT EXISTS set_jobs_completed_at
    AFTER UPDATE OF status ON jobs
    FOR EACH ROW
    WHEN NEW.status IN ('COMPLETE', 'FAILED', 'CANCELED') AND OLD.status NOT IN ('COMPLETE', 'FAILED', 'CANCELED')
BEGIN
    UPDATE jobs SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
