import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config.js';
import { performDubbing } from './dubber.js';
import { publishStateChange, publishLog, publishError, closeRedis, getRedis } from './events.js';
import type { DubJobData, MuxJobData } from './types.js';

// Redact password from Redis URL for safe logging
function redactRedisUrl(url: string): string {
  return url.replace(/(redis:\/\/[^:]*:)[^@]+(@)/, '$1***$2');
}

console.log('Starting Dubbing Worker...');
console.log(`Redis URL: ${redactRedisUrl(config.redisUrl)}`);
console.log(`Concurrency: ${config.concurrency}`);

// Create Redis connection for BullMQ
const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

// Create worker
const worker = new Worker<DubJobData>(
  'dub',
  async (job: Job<DubJobData>) => {
    const data = job.data;
    const jobId = data.jobId;

    console.log(`Processing dubbing job ${jobId}`);

    try {
      // Update state
      await publishStateChange(jobId, 'DOWNLOADED', 'DUBBING');
      await publishLog(jobId, 'info', 'Starting dubbing process');

      // Perform dubbing
      const dubbedAudioPath = await performDubbing(data);

      // Update state
      await publishStateChange(jobId, 'DUBBING', 'DUBBED');
      await publishLog(jobId, 'info', 'Dubbing complete, enqueueing mux job');

      // Enqueue mux job
      await enqueueMuxJob(data, dubbedAudioPath);

      console.log(`Dubbing job ${jobId} completed successfully`);
      return { success: true, dubbedAudioPath };
    } catch (err) {
      const error = err as Error;
      console.error(`Dubbing job ${jobId} failed:`, error);

      await publishError(
        jobId,
        'DUBBING_FAILED',
        error.message,
        false,
        error.stack
      );

      await publishStateChange(jobId, 'DUBBING', 'FAILED');

      throw error;
    }
  },
  {
    connection,
    concurrency: config.concurrency,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  }
);

// Enqueue mux job after successful dubbing
async function enqueueMuxJob(dubJob: DubJobData, dubbedAudioPath: string): Promise<void> {
  const muxJobData: MuxJobData = {
    jobId: dubJob.jobId,
    videoPath: dubJob.videoPath,
    audioDubbedPath: dubbedAudioPath,
    targetLang: dubJob.targetLang,
    outputContainer: dubJob.outputContainer,
    duckingLevel: 0.3,
    normalizationLufs: -18.0,
    tempDir: dubJob.tempDir,
    finalPath: dubJob.finalPath, // Use the correct finalPath from job data
  };

  // Add to mux queue
  await getRedis().rpush('mux', JSON.stringify(muxJobData));
  console.log(`Enqueued mux job for ${dubJob.jobId} -> ${dubJob.finalPath}`);
}

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown with proper drain
async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    // First, pause the worker to stop accepting new jobs
    await worker.pause();
    console.log('Worker paused, waiting for active jobs to complete...');

    // Close worker (waits for active jobs to complete)
    await worker.close();
    console.log('Worker closed');

    // Close Redis connections in parallel
    await Promise.all([closeRedis(), connection.quit()]);

    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('Dubbing Worker started, waiting for jobs...');
