/**
 * E2E API Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const API_URL = process.env.API_URL || 'http://localhost:3000';

let authToken = null;

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  return { status: response.status, data };
}

describe('API E2E Tests', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const { status, data } = await request('/healthz');
      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, 'healthy');
    });

    it('should return readiness status', async () => {
      const { status } = await request('/readyz');
      assert.strictEqual(status, 200);
    });
  });

  describe('Authentication', () => {
    it('should login with default credentials', async () => {
      const { status, data } = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: 'admin',
          password: 'admin',
        }),
      });

      assert.strictEqual(status, 200);
      assert.ok(data.token);
      assert.ok(data.user);
      assert.strictEqual(data.user.username, 'admin');

      authToken = data.token;
    });

    it('should reject invalid credentials', async () => {
      const { status } = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: 'admin',
          password: 'wrongpassword',
        }),
      });

      assert.strictEqual(status, 401);
    });
  });

  describe('Jobs API', () => {
    let createdJobId = null;

    it('should create a new job', async () => {
      const { status, data } = await request('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          requestedDubbing: true,
          targetLang: 'ru',
          formatPreset: 'bestvideo+bestaudio',
          outputContainer: 'mkv',
        }),
      });

      assert.strictEqual(status, 201);
      assert.ok(data.id);
      assert.strictEqual(data.status, 'QUEUED');
      assert.strictEqual(data.requestedDubbing, true);
      assert.strictEqual(data.targetLang, 'ru');

      createdJobId = data.id;
    });

    it('should list all jobs', async () => {
      const { status, data } = await request('/api/jobs');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
    });

    it('should get job details', async () => {
      const { status, data } = await request(`/api/jobs/${createdJobId}`);

      assert.strictEqual(status, 200);
      assert.strictEqual(data.id, createdJobId);
      assert.ok(data.url);
    });

    it('should cancel a job', async () => {
      const { status, data } = await request(`/api/jobs/${createdJobId}/cancel`, {
        method: 'POST',
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, 'CANCELED');
    });

    it('should delete a job', async () => {
      const { status } = await request(`/api/jobs/${createdJobId}`, {
        method: 'DELETE',
      });

      assert.strictEqual(status, 204);
    });

    it('should return 404 for deleted job', async () => {
      const { status } = await request(`/api/jobs/${createdJobId}`);
      assert.strictEqual(status, 404);
    });
  });

  describe('Metrics', () => {
    it('should return prometheus metrics', async () => {
      const response = await fetch(`${API_URL}/metrics`);
      const text = await response.text();

      assert.strictEqual(response.status, 200);
      assert.ok(text.includes('process_cpu'));
    });
  });
});
