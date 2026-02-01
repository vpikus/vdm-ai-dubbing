import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Worker settings
  concurrency: parseInt(process.env.DUBBING_CONCURRENCY || '2', 10),
};
