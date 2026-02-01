import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, statSync } from 'fs';
import { isRedisHealthy, getQueueStats } from '../queue/client.js';
import { getDatabase } from '../db/database.js';
import { config } from '../config.js';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

// =============================================================================
// METRICS SETUP
// =============================================================================

// Collect default Node.js metrics
collectDefaultMetrics({ prefix: 'vdm_' });

// Custom metrics
export const jobsCreatedTotal = new Counter({
  name: 'vdm_jobs_created_total',
  help: 'Total number of jobs created',
});

export const jobsCompletedTotal = new Counter({
  name: 'vdm_jobs_completed_total',
  help: 'Total number of jobs completed successfully',
  labelNames: ['type'] as const, // download_only, with_dubbing
});

export const jobsFailedTotal = new Counter({
  name: 'vdm_jobs_failed_total',
  help: 'Total number of jobs failed',
  labelNames: ['stage'] as const, // downloading, dubbing, muxing
});

export const activeJobsGauge = new Gauge({
  name: 'vdm_active_jobs',
  help: 'Number of currently active jobs',
  labelNames: ['queue'] as const, // download, dub, mux
});

export const queueDepthGauge = new Gauge({
  name: 'vdm_queue_depth',
  help: 'Number of jobs waiting in queue',
  labelNames: ['queue'] as const,
});

export const downloadDurationHistogram = new Histogram({
  name: 'vdm_download_duration_seconds',
  help: 'Time spent downloading videos',
  buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
});

export const diskSpaceFreeGauge = new Gauge({
  name: 'vdm_disk_space_free_bytes',
  help: 'Free disk space on media volume',
});

// =============================================================================
// ROUTES
// =============================================================================

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check endpoint
  fastify.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      redis: false,
      sqlite: false,
      filesystem: false,
    };

    // Check Redis
    try {
      checks.redis = await isRedisHealthy();
    } catch {
      checks.redis = false;
    }

    // Check SQLite
    try {
      const db = getDatabase();
      const result = db.prepare('SELECT 1 as ok').get() as { ok: number };
      checks.sqlite = result?.ok === 1;
    } catch {
      checks.sqlite = false;
    }

    // Check filesystem
    try {
      checks.filesystem = existsSync(config.mediaRoot);
    } catch {
      checks.filesystem = false;
    }

    const allHealthy = checks.redis && checks.sqlite && checks.filesystem;
    const anyHealthy = checks.redis || checks.sqlite || checks.filesystem;

    const status = allHealthy ? 'ok' : anyHealthy ? 'degraded' : 'unhealthy';

    const response = {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: checks.redis ? 'ok' : 'error',
        sqlite: checks.sqlite ? 'ok' : 'error',
        filesystem: checks.filesystem ? 'ok' : 'error',
      },
    };

    const statusCode = status === 'unhealthy' ? 503 : 200;

    return reply.status(statusCode).send(response);
  });

  // Prometheus metrics endpoint
  if (config.enableMetrics) {
    fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Update queue metrics
        const downloadStats = await getQueueStats('download');
        const dubStats = await getQueueStats('dub');
        const muxStats = await getQueueStats('mux');

        activeJobsGauge.set({ queue: 'download' }, downloadStats.active);
        activeJobsGauge.set({ queue: 'dub' }, dubStats.active);
        activeJobsGauge.set({ queue: 'mux' }, muxStats.active);

        queueDepthGauge.set({ queue: 'download' }, downloadStats.waiting);
        queueDepthGauge.set({ queue: 'dub' }, dubStats.waiting);
        queueDepthGauge.set({ queue: 'mux' }, muxStats.waiting);

        // Update disk space metric
        try {
          statSync(config.mediaRoot);
          // Note: statSync doesn't provide disk space, would need statvfs via native module
          // For now, we skip this metric
        } catch {
          // Ignore filesystem errors
        }

        reply.header('Content-Type', register.contentType);
        return reply.send(await register.metrics());
      } catch (err) {
        fastify.log.error(err, 'Failed to collect metrics');
        return reply.status(500).send('Failed to collect metrics');
      }
    });
  }

  // Readiness check (for Kubernetes)
  fastify.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const redisOk = await isRedisHealthy();
      const db = getDatabase();
      const result = db.prepare('SELECT 1 as ok').get() as { ok: number };
      const sqliteOk = result?.ok === 1;

      if (redisOk && sqliteOk) {
        return reply.send({ status: 'ready' });
      } else {
        return reply.status(503).send({ status: 'not ready' });
      }
    } catch {
      return reply.status(503).send({ status: 'not ready' });
    }
  });

  // Liveness check (for Kubernetes)
  fastify.get('/livez', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'alive' });
  });
}
