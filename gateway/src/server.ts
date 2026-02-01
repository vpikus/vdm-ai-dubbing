import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { runMigrations, closeDatabase } from './db/database.js';
import { ensureAdminUser } from './db/users.js';
import { isSessionValid } from './db/users.js';
import {
  getRedisClient,
  closeRedisConnections,
  closeQueues,
  initializeEventListener,
} from './queue/client.js';
import { initializeWebSocket, closeWebSocket, subscribeToRedisEvents } from './websocket/server.js';
import { jobRoutes } from './routes/jobs.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// FASTIFY TYPE AUGMENTATION
// =============================================================================

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: number;
      username: string;
      role: 'admin' | 'user';
      jti: string;
    };
    user: {
      sub: number;
      username: string;
      role: 'admin' | 'user';
      jti: string;
    };
  }
}

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // =============================================================================
  // PLUGINS
  // =============================================================================

  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for SPA
  });

  // JWT authentication
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // =============================================================================
  // AUTHENTICATION DECORATOR
  // =============================================================================

  fastify.decorate(
    'authenticate',
    async function (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) {
      try {
        await request.jwtVerify();

        // Verify session is still valid
        const payload = request.user;
        if (payload.jti && !isSessionValid(payload.jti)) {
          return reply.status(401).send({
            error: 'Session expired',
            code: 'SESSION_EXPIRED',
          });
        }
      } catch {
        return reply.status(401).send({
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
        });
      }
    }
  );

  // =============================================================================
  // ROUTES
  // =============================================================================

  // API routes under /api prefix
  await fastify.register(
    async function apiRoutes(api) {
      await api.register(authRoutes);
      await api.register(jobRoutes);
    },
    { prefix: '/api' }
  );

  // Health routes at root level
  await fastify.register(healthRoutes);

  // Static files for web UI (in production)
  if (config.nodeEnv === 'production') {
    await fastify.register(fastifyStatic, {
      root: join(__dirname, '../../public'),
      prefix: '/',
    });

    // SPA fallback - serve index.html for non-API routes
    fastify.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({
        error: 'Not found',
        code: 'NOT_FOUND',
      });
    });
  }

  return fastify;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('Starting Video Download Manager Gateway...');

  try {
    // Run database migrations
    console.log('Running database migrations...');
    runMigrations();

    // Ensure admin user exists
    await ensureAdminUser();

    // Initialize Redis connection
    console.log('Connecting to Redis...');
    getRedisClient();

    // Initialize event listener for Redis Pub/Sub
    initializeEventListener();

    // Subscribe to Redis events early (before server starts listening)
    // This ensures database updates happen even if events arrive before WebSocket is ready
    console.log('Subscribing to Redis events...');
    subscribeToRedisEvents();

    // Build Fastify server
    const fastify = await buildServer();

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);

      try {
        // Close WebSocket connections
        closeWebSocket();

        // Close Fastify server
        await fastify.close();

        // Close queue connections
        await closeQueues();

        // Close Redis connections
        await closeRedisConnections();

        // Close database
        closeDatabase();

        console.log('Shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start server
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    // Initialize WebSocket server on Fastify's underlying http server
    console.log('Initializing WebSocket server...');
    initializeWebSocket(fastify.server);

    console.log(`Gateway listening on http://0.0.0.0:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Log level: ${config.logLevel}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
