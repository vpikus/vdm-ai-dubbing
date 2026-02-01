import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import type {
  DownloadJobData,
  DubJobData,
  MuxJobData,
  QueueName,
  EventChannel,
  EventMessage,
} from '../../types/index.js';

// =============================================================================
// REDIS CONNECTIONS
// =============================================================================

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  }

  return redisClient;
}

export function getSubscriberClient(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    subscriberClient.on('error', (err) => {
      console.error('Redis subscriber error:', err);
    });
  }

  return subscriberClient;
}

export async function closeRedisConnections(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }

  if (subscriberClient) {
    await subscriberClient.quit();
    subscriberClient = null;
  }
}

// =============================================================================
// QUEUES
// =============================================================================

let downloadQueue: Queue<DownloadJobData> | null = null;
let dubQueue: Queue<DubJobData> | null = null;
let muxQueue: Queue<MuxJobData> | null = null;

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 hours
    count: 100,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
    count: 500,
  },
};

export function getDownloadQueue(): Queue<DownloadJobData> {
  if (!downloadQueue) {
    downloadQueue = new Queue<DownloadJobData>('download', {
      connection: getRedisClient(),
      defaultJobOptions,
    });
  }

  return downloadQueue;
}

export function getDubQueue(): Queue<DubJobData> {
  if (!dubQueue) {
    dubQueue = new Queue<DubJobData>('dub', {
      connection: getRedisClient(),
      defaultJobOptions,
    });
  }

  return dubQueue;
}

export function getMuxQueue(): Queue<MuxJobData> {
  if (!muxQueue) {
    muxQueue = new Queue<MuxJobData>('mux', {
      connection: getRedisClient(),
      defaultJobOptions,
    });
  }

  return muxQueue;
}

export async function closeQueues(): Promise<void> {
  if (downloadQueue) {
    await downloadQueue.close();
    downloadQueue = null;
  }

  if (dubQueue) {
    await dubQueue.close();
    dubQueue = null;
  }

  if (muxQueue) {
    await muxQueue.close();
    muxQueue = null;
  }
}

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

export async function enqueueDownload(
  jobId: string,
  data: DownloadJobData,
  priority: number = 0
): Promise<void> {
  const queue = getDownloadQueue();

  // Remove existing job if it exists (failed/completed) to allow re-queue
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    await existingJob.remove();
  }

  // Use BullMQ for tracking
  await queue.add(jobId, data, {
    jobId,
    priority,
  });

  // Also push to simple Redis list for Python worker compatibility
  await getRedisClient().rpush('download', JSON.stringify(data));
}

export async function enqueueDub(
  jobId: string,
  data: DubJobData,
  priority: number = 0
): Promise<void> {
  const queue = getDubQueue();

  // Remove existing job if it exists (failed/completed) to allow re-queue
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    await existingJob.remove();
  }

  await queue.add(jobId, data, {
    jobId,
    priority,
  });
}

export async function enqueueMux(
  jobId: string,
  data: MuxJobData,
  priority: number = 0
): Promise<void> {
  const queue = getMuxQueue();

  // Remove existing job if it exists (failed/completed) to allow re-queue
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    await existingJob.remove();
  }

  await queue.add(jobId, data, {
    jobId,
    priority,
  });
}

export async function getQueueStats(queueName: QueueName): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  let queue: Queue;

  switch (queueName) {
    case 'download':
      queue = getDownloadQueue();
      break;
    case 'dub':
      queue = getDubQueue();
      break;
    case 'mux':
      queue = getMuxQueue();
      break;
  }

  const counts = await queue.getJobCounts();

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

// =============================================================================
// PUB/SUB
// =============================================================================

type EventHandler = (message: EventMessage) => void;

const eventHandlers: Map<EventChannel, Set<EventHandler>> = new Map();

export function subscribeToEvents(channel: EventChannel, handler: EventHandler): () => void {
  if (!eventHandlers.has(channel)) {
    eventHandlers.set(channel, new Set());

    // Subscribe to Redis channel
    const subscriber = getSubscriberClient();
    subscriber.subscribe(channel);
  }

  const handlers = eventHandlers.get(channel)!;
  handlers.add(handler);

  // Return unsubscribe function
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      eventHandlers.delete(channel);
      getSubscriberClient().unsubscribe(channel);
    }
  };
}

export function subscribeToAllEvents(handler: EventHandler): () => void {
  const channels: EventChannel[] = [
    'events:progress',
    'events:state',
    'events:log',
    'events:error',
    'events:metadata',
  ];

  const unsubscribers = channels.map((channel) => subscribeToEvents(channel, handler));

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

export async function publishEvent(channel: EventChannel, message: EventMessage): Promise<void> {
  await getRedisClient().publish(channel, JSON.stringify(message));
}

// Initialize message handler
export function initializeEventListener(): void {
  const subscriber = getSubscriberClient();

  subscriber.on('message', (channel, message) => {
    const handlers = eventHandlers.get(channel as EventChannel);
    if (!handlers || handlers.size === 0) return;

    try {
      const parsed = JSON.parse(message) as EventMessage;
      handlers.forEach((handler) => {
        try {
          handler(parsed);
        } catch (err) {
          console.error('Event handler error:', err);
        }
      });
    } catch (err) {
      console.error('Failed to parse event message:', err);
    }
  });
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await getRedisClient().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
