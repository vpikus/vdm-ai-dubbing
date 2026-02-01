-- Migration: Add use_lively_voice column for AI dubbing
-- Version: 1.1.0

-- Add use_lively_voice column to jobs table (default false/0)
ALTER TABLE jobs ADD COLUMN use_lively_voice INTEGER NOT NULL DEFAULT 0 CHECK (use_lively_voice IN (0, 1));
