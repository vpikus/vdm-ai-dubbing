import Redis from 'ioredis';
import { config } from './config.js';
import type { EventMessage } from './types.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl);
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export async function publishEvent(channel: string, message: EventMessage): Promise<void> {
  try {
    await getRedis().publish(
      channel,
      JSON.stringify({
        jobId: message.jobId,
        type: message.type,
        timestamp: message.timestamp,
        payload: message.payload,
      })
    );
  } catch (err) {
    console.error(`Failed to publish event to ${channel}:`, err);
  }
}

export async function publishProgress(
  jobId: string,
  stage: string,
  percent: number
): Promise<void> {
  await publishEvent('events:progress', {
    jobId,
    type: 'progress',
    timestamp: new Date().toISOString(),
    payload: { stage, percent },
  });
}

export async function publishStateChange(
  jobId: string,
  fromStatus: string,
  toStatus: string
): Promise<void> {
  await publishEvent('events:state', {
    jobId,
    type: 'state_change',
    timestamp: new Date().toISOString(),
    payload: { from: fromStatus, to: toStatus },
  });
}

export async function publishLog(
  jobId: string,
  level: string,
  message: string
): Promise<void> {
  await publishEvent('events:log', {
    jobId,
    type: 'log',
    timestamp: new Date().toISOString(),
    payload: { level, message },
  });
}

export async function publishError(
  jobId: string,
  code: string,
  message: string,
  retryable: boolean,
  stack?: string
): Promise<void> {
  await publishEvent('events:error', {
    jobId,
    type: 'error',
    timestamp: new Date().toISOString(),
    payload: { code, message, retryable, stack },
  });
}
