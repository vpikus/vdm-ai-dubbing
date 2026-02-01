/**
 * Jobs API Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { jobRoutes } from '../routes/jobs';
import { getDatabase, closeDatabase } from '../db/database';
import * as jobsDb from '../db/jobs';

describe('Jobs API', () => {
  const app = Fastify();

  beforeAll(async () => {
    // Initialize test database
    getDatabase();

    // Mock authenticate decorator (routes require this)
    app.decorate('authenticate', async () => {
      // No-op for tests - skip authentication
    });

    // Register routes
    await app.register(jobRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  describe('POST /api/jobs', () => {
    it('should create a new job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          requestedDubbing: true,
          targetLang: 'ru',
        },
      });

      expect(response.statusCode).toBe(201);

      const job = response.json();
      expect(job).toHaveProperty('id');
      expect(job.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(job.status).toBe('QUEUED');
      expect(job.requestedDubbing).toBe(true);
      expect(job.targetLang).toBe('ru');
    });

    it('should validate URL is required', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate URL format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {
          url: 'not-a-url',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/jobs', () => {
    it('should return list of jobs', async () => {
      // Create a job first
      await jobsDb.createJob({
        url: 'https://example.com/video1',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/jobs',
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result).toHaveProperty('jobs');
      expect(Array.isArray(result.jobs)).toBe(true);
      expect(result.jobs.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/jobs?status=QUEUED',
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      result.jobs.forEach((job: { status: string }) => {
        expect(job.status).toBe('QUEUED');
      });
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('should return job details', async () => {
      // Create a job
      const job = await jobsDb.createJob({
        url: 'https://example.com/video2',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/jobs/${job.id}`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.id).toBe(job.id);
      expect(result.url).toBe('https://example.com/video2');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/jobs/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/jobs/:id/cancel', () => {
    it('should cancel a queued job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video3',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/cancel`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.status).toBe('CANCELED');
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('should delete a job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video4',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Cancel first
      await jobsDb.updateJobStatus(job.id, 'CANCELED');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/jobs/${job.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verify deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/jobs/${job.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /api/jobs/:id/retry', () => {
    it('should retry a failed job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-retry-1',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Set job to FAILED state
      await jobsDb.updateJobStatus(job.id, 'FAILED', 'Test failure');

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/retry`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.status).toBe('QUEUED');
    });

    it('should retry a canceled job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-retry-2',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Set job to CANCELED state
      await jobsDb.updateJobStatus(job.id, 'CANCELED');

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/retry`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.status).toBe('QUEUED');
    });

    it('should reject retry for queued job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-retry-3',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Job is already QUEUED
      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/retry`,
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.code).toBe('INVALID_STATE');
    });

    it('should reject retry for completed job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-retry-4',
        requestedDubbing: false,
        targetLang: 'en',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Set job to COMPLETE state
      await jobsDb.updateJobStatus(job.id, 'COMPLETE');

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/retry`,
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.code).toBe('INVALID_STATE');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/non-existent-id/retry',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/jobs/:id/resume', () => {
    it('should reject resume for non-failed job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-resume-1',
        requestedDubbing: true,
        targetLang: 'ru',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Job is QUEUED, not FAILED
      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/resume`,
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.code).toBe('INVALID_STATE');
    });

    it('should reject resume when no stage completed', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-resume-2',
        requestedDubbing: true,
        targetLang: 'ru',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // Set to FAILED without any completed stages
      await jobsDb.updateJobStatus(job.id, 'FAILED', 'Download failed');

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/resume`,
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.code).toBe('CANNOT_RESUME');
      expect(result.details).toHaveProperty('downloadCompleted', false);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/non-existent-id/resume',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject resume for canceled job', async () => {
      const job = await jobsDb.createJob({
        url: 'https://example.com/video-resume-3',
        requestedDubbing: true,
        targetLang: 'ru',
        formatPreset: 'bestvideo+bestaudio',
        outputContainer: 'mkv',
        downloadSubtitles: false,
        priority: 0,
      });

      // CANCELED is not FAILED
      await jobsDb.updateJobStatus(job.id, 'CANCELED');

      const response = await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/resume`,
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.code).toBe('INVALID_STATE');
    });
  });
});
