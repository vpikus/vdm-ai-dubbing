import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Media storage
  mediaRoot: process.env.MEDIA_ROOT || './media',

  // Worker settings
  concurrency: parseInt(process.env.DUBBING_CONCURRENCY || '2', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),

  // Dubbing settings
  targetLang: process.env.TARGET_LANG || 'ru',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
