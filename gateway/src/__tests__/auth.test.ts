/**
 * Auth API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { authRoutes } from '../routes/auth';
import { getDatabase } from '../db/database';
import * as usersDb from '../db/users';

describe('Auth API', () => {
  const app = Fastify();

  beforeAll(async () => {
    // Initialize test database
    getDatabase();

    // Create test user
    await usersDb.createUser('testuser', 'testpass', 'admin');

    // Register JWT plugin (required for token generation)
    await app.register(fastifyJwt, {
      secret: process.env.JWT_SECRET || 'test-secret-for-vitest-minimum-32-chars',
    });

    // Mock authenticate decorator (logout route requires this)
    app.decorate('authenticate', async () => {
      // No-op for tests - skip authentication
    });

    // Register routes
    await app.register(authRoutes, { prefix: '/api' });
    await app.ready();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = response.json();
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe('admin');
    });

    it('should reject invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'wrongpass',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'nonexistent',
          password: 'testpass',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
