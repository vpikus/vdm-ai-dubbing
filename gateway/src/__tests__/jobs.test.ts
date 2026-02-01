/**
 * Jobs API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { jobRoutes } from '../routes/jobs';
import { getDatabase } from '../db/database';
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
      const jobs = response.json();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/jobs?status=QUEUED',
      });

      expect(response.statusCode).toBe(200);
      const jobs = response.json();
      jobs.forEach((job: { status: string }) => {
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
});
