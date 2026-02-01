import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rm, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import {
  createJobWithEvents,
  getJobById,
  listJobs,
  updateJobStatus,
  updateJobPriority,
  deleteJob,
  getMediaByJobId,
  getJobEvents,
  logJobEvent,
} from '../db/jobs.js';
import { enqueueDownload, enqueueDub, enqueueMux } from '../queue/client.js';
import { config } from '../config.js';
import { join } from 'path';
import type { JobStatus, CreateJobRequest, Job, Media } from '../../types/index.js';

// =============================================================================
// CLEANUP UTILITIES
// =============================================================================

/**
 * Clean up all files associated with a job (temp directory and completed files)
 */
async function cleanupJobFiles(job: Job, media?: Media): Promise<void> {
  const tempDir = join(config.mediaRoot, 'incomplete', job.id);

  // Clean up temp directory
  if (existsSync(tempDir)) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to clean up temp directory ${tempDir}:`, err);
    }
  }

  // Clean up completed video file if exists
  if (media?.videoPath && existsSync(media.videoPath)) {
    try {
      await rm(media.videoPath, { force: true });
    } catch (err) {
      console.error(`Failed to clean up video file ${media.videoPath}:`, err);
    }
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createJobSchema = z.object({
  url: z.string().url(),
  requestedDubbing: z.boolean().optional().default(false),
  targetLang: z.string().optional(),
  useLivelyVoice: z.boolean().optional().default(false),
  formatPreset: z.enum(['bestvideo+bestaudio', 'best', 'bestaudio', 'worst']).optional(),
  outputContainer: z.enum(['mkv', 'mp4', 'webm']).optional(),
  downloadSubtitles: z.boolean().optional().default(false),
  priority: z.number().int().min(0).max(10).optional().default(0),
  cookies: z.string().optional(), // Optional Netscape format cookies content
});

const controlJobSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel', 'prioritize']),
  priority: z.number().int().min(0).max(10).optional(),
});

const listJobsQuerySchema = z.object({
  status: z
    .enum([
      'QUEUED',
      'DOWNLOADING',
      'DOWNLOADED',
      'DUBBING',
      'DUBBED',
      'MUXING',
      'COMPLETE',
      'FAILED',
      'CANCELED',
    ])
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  // Create new job
  fastify.post(
    '/jobs',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parseResult = createJobSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      const jobRequest: CreateJobRequest = parseResult.data;

      try {
        // Create job in database
        const job = createJobWithEvents(jobRequest);

        // Generate file paths
        const tempDir = join(config.mediaRoot, 'incomplete', job.id);
        const finalPath = join(
          config.mediaRoot,
          'complete',
          `${job.id}.${job.outputContainer}`
        );

        // Write cookies file if provided
        let cookiesFile: string | undefined;
        if (jobRequest.cookies?.trim()) {
          await mkdir(tempDir, { recursive: true });
          cookiesFile = join(tempDir, 'cookies.txt');
          await writeFile(cookiesFile, jobRequest.cookies);
        }

        // Enqueue download job
        await enqueueDownload(
          job.id,
          {
            jobId: job.id,
            url: job.url,
            formatPreset: job.formatPreset,
            outputContainer: job.outputContainer,
            requestedDubbing: job.requestedDubbing,
            targetLang: job.targetLang,
            useLivelyVoice: job.useLivelyVoice,
            downloadSubtitles: job.downloadSubtitles,
            tempDir,
            finalPath,
            cookiesFile,
          },
          job.priority
        );

        return reply.status(201).send(job);
      } catch (err) {
        fastify.log.error(err, 'Failed to create job');
        return reply.status(500).send({
          error: 'Failed to create job',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // List jobs
  fastify.get(
    '/jobs',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parseResult = listJobsQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      const { status, search, limit, offset } = parseResult.data;

      const result = listJobs({
        status: status as JobStatus | undefined,
        search,
        limit,
        offset,
      });

      return reply.send({
        jobs: result.jobs,
        total: result.total,
        limit,
        offset,
      });
    }
  );

  // Get job details
  fastify.get<{ Params: { id: string } }>(
    '/jobs/:id',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      const media = getMediaByJobId(id);
      const eventsResult = getJobEvents(id, { limit: 50 });

      return reply.send({
        ...job,
        media,
        events: eventsResult.events,
      });
    }
  );

  // Control job (pause, resume, cancel, prioritize)
  fastify.post<{ Params: { id: string } }>(
    '/jobs/:id/control',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const parseResult = controlJobSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      const { action, priority } = parseResult.data;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      try {
        switch (action) {
          case 'cancel':
            if (['COMPLETE', 'FAILED', 'CANCELED'].includes(job.status)) {
              return reply.status(400).send({
                error: 'Cannot cancel job in terminal state',
                code: 'INVALID_STATE',
              });
            }
            updateJobStatus(id, 'CANCELED');
            logJobEvent(id, 'state_change', { from: job.status, to: 'CANCELED' });
            break;

          case 'prioritize':
            if (priority === undefined) {
              return reply.status(400).send({
                error: 'Priority is required for prioritize action',
                code: 'VALIDATION_ERROR',
              });
            }
            updateJobPriority(id, priority);
            logJobEvent(id, 'log', {
              level: 'info',
              message: `Priority changed to ${priority}`,
            });
            break;

          case 'pause':
          case 'resume':
            // TODO: Implement pause/resume via BullMQ job controls
            return reply.status(501).send({
              error: 'Pause/resume not yet implemented',
              code: 'NOT_IMPLEMENTED',
            });
        }

        const updatedJob = getJobById(id);
        return reply.send(updatedJob);
      } catch (err) {
        fastify.log.error(err, 'Failed to control job');
        return reply.status(500).send({
          error: 'Failed to control job',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Cancel job (convenience endpoint)
  fastify.post<{ Params: { id: string } }>(
    '/jobs/:id/cancel',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      if (['COMPLETE', 'FAILED', 'CANCELED'].includes(job.status)) {
        return reply.status(400).send({
          error: 'Cannot cancel job in terminal state',
          code: 'INVALID_STATE',
        });
      }

      try {
        updateJobStatus(id, 'CANCELED');
        logJobEvent(id, 'state_change', { from: job.status, to: 'CANCELED' });

        // Clean up temp files
        const media = getMediaByJobId(id);
        await cleanupJobFiles(job, media);
        logJobEvent(id, 'log', { level: 'info', message: 'Cleaned up temporary files' });

        const updatedJob = getJobById(id);
        return reply.send(updatedJob);
      } catch (err) {
        fastify.log.error(err, 'Failed to cancel job');
        return reply.status(500).send({
          error: 'Failed to cancel job',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Delete job
  fastify.delete<{ Params: { id: string } }>(
    '/jobs/:id',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      // Clean up media files on disk before deleting from database
      const media = getMediaByJobId(id);
      await cleanupJobFiles(job, media);

      const deleted = deleteJob(id);

      if (!deleted) {
        return reply.status(500).send({
          error: 'Failed to delete job',
          code: 'INTERNAL_ERROR',
        });
      }

      return reply.status(204).send();
    }
  );

  // Retry failed job
  fastify.post<{ Params: { id: string } }>(
    '/jobs/:id/retry',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      // Only allow retry for failed or canceled jobs
      if (!['FAILED', 'CANCELED'].includes(job.status)) {
        return reply.status(400).send({
          error: 'Can only retry failed or canceled jobs',
          code: 'INVALID_STATE',
        });
      }

      try {
        // Reset job status to QUEUED
        updateJobStatus(id, 'QUEUED');
        logJobEvent(id, 'retry', { previousStatus: job.status });
        logJobEvent(id, 'state_change', { from: job.status, to: 'QUEUED' });

        // Generate file paths
        const tempDir = join(config.mediaRoot, 'incomplete', job.id);
        const finalPath = join(
          config.mediaRoot,
          'complete',
          `${job.id}.${job.outputContainer}`
        );

        // Re-enqueue download job
        await enqueueDownload(
          job.id,
          {
            jobId: job.id,
            url: job.url,
            formatPreset: job.formatPreset,
            outputContainer: job.outputContainer,
            requestedDubbing: job.requestedDubbing,
            targetLang: job.targetLang,
            useLivelyVoice: job.useLivelyVoice,
            downloadSubtitles: job.downloadSubtitles,
            tempDir,
            finalPath,
          },
          job.priority
        );

        const updatedJob = getJobById(id);
        return reply.send(updatedJob);
      } catch (err) {
        fastify.log.error(err, 'Failed to retry job');
        return reply.status(500).send({
          error: 'Failed to retry job',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Resume failed job from last successful step
  fastify.post<{ Params: { id: string } }>(
    '/jobs/:id/resume',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      // Only allow resume for failed jobs
      if (job.status !== 'FAILED') {
        return reply.status(400).send({
          error: 'Can only resume failed jobs',
          code: 'INVALID_STATE',
        });
      }

      const media = getMediaByJobId(id);
      const tempDir = join(config.mediaRoot, 'incomplete', job.id);

      // Check which stages completed successfully by looking at state transitions
      const eventsResult = getJobEvents(id, { limit: 200 });
      const reachedStates = new Set(
        eventsResult.events
          .filter((e) => e.event === 'state_change')
          .map((e) => (e.payload as { to: string }).to)
      );

      const downloadCompleted = reachedStates.has('DOWNLOADED');
      const dubbingCompleted = reachedStates.has('DUBBED');

      // Also verify files exist (in case they were cleaned up)
      const hasVideo = !!(media?.videoPath && existsSync(media.videoPath));
      const hasDubbedAudio = !!(media?.audioDubbedPath && existsSync(media.audioDubbedPath));

      try {
        // Determine what to resume based on completed stages AND available files
        if (dubbingCompleted && hasVideo && hasDubbedAudio) {
          // Resume from muxing - both video and dubbed audio exist
          updateJobStatus(id, 'DUBBED');
          logJobEvent(id, 'retry', { previousStatus: job.status, resumeFrom: 'muxing' });
          logJobEvent(id, 'state_change', { from: job.status, to: 'DUBBED' });

          const finalPath = join(
            config.mediaRoot,
            'complete',
            `${media.sourceTitle || job.id} [${media.sourceId || job.id}].${job.outputContainer}`
          );

          await enqueueMux(
            job.id,
            {
              jobId: job.id,
              videoPath: media.videoPath!,
              audioDubbedPath: media.audioDubbedPath!,
              targetLang: job.targetLang,
              outputContainer: job.outputContainer,
              duckingLevel: -12,
              normalizationLufs: -16,
              tempDir,
              finalPath,
            },
            job.priority
          );

          const updatedJob = getJobById(id);
          return reply.send({ ...updatedJob, resumedFrom: 'muxing' });
        } else if (downloadCompleted && hasVideo && job.requestedDubbing) {
          // Resume from dubbing - download completed and video exists
          updateJobStatus(id, 'DOWNLOADED');
          logJobEvent(id, 'retry', { previousStatus: job.status, resumeFrom: 'dubbing' });
          logJobEvent(id, 'state_change', { from: job.status, to: 'DOWNLOADED' });

          const finalPath = join(
            config.mediaRoot,
            'complete',
            `${media!.sourceTitle || job.id} [${media!.sourceId || job.id}].${job.outputContainer}`
          );

          await enqueueDub(
            job.id,
            {
              jobId: job.id,
              url: job.url,
              videoPath: media!.videoPath!,
              targetLang: job.targetLang,
              useLivelyVoice: job.useLivelyVoice,
              tempDir,
              outputPath: join(tempDir, 'dubbed.wav'),
              finalPath,
              outputContainer: job.outputContainer,
            },
            job.priority
          );

          const updatedJob = getJobById(id);
          return reply.send({ ...updatedJob, resumedFrom: 'dubbing' });
        } else {
          // Cannot resume - need to restart from beginning
          return reply.status(400).send({
            error: 'Cannot resume: no completed stage to resume from. Use /retry to restart from beginning.',
            code: 'CANNOT_RESUME',
            details: {
              downloadCompleted,
              dubbingCompleted,
              hasVideo,
              hasDubbedAudio,
              requestedDubbing: job.requestedDubbing,
            },
          });
        }
      } catch (err) {
        fastify.log.error(err, 'Failed to resume job');
        return reply.status(500).send({
          error: 'Failed to resume job',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Get job logs
  fastify.get<{ Params: { id: string } }>(
    '/jobs/:id/logs',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const parseResult = logsQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      const job = getJobById(id);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          code: 'NOT_FOUND',
        });
      }

      const { limit, offset } = parseResult.data;
      const result = getJobEvents(id, { limit, offset });

      return reply.send({
        events: result.events,
        total: result.total,
        limit,
        offset,
      });
    }
  );
}
