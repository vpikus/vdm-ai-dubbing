import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenvConfig();

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Redis
  redisUrl: z.string().url().default('redis://localhost:6379'),

  // Database
  dbPath: z.string().default('./data/db.sqlite'),

  // Media storage
  mediaRoot: z.string().default('./media'),
  minFreeSpaceGb: z.coerce.number().default(10),
  alertFreeSpaceGb: z.coerce.number().default(20),

  // Auth (validation relaxed in development, strict in production)
  jwtSecret: z.string().min(1).refine(
    (val) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || val.length >= 32,
    { message: 'JWT secret must be at least 32 characters in production' }
  ),
  jwtExpiresIn: z.string().default('7d'),
  adminUsername: z.string().min(1),
  adminPassword: z.string().min(1),

  // Queue concurrency
  downloadConcurrency: z.coerce.number().default(1),
  dubbingConcurrency: z.coerce.number().default(2),
  muxingConcurrency: z.coerce.number().default(1),

  // Default job options
  defaultTargetLang: z.string().default('ru'),
  defaultContainer: z.enum(['mkv', 'mp4', 'webm']).default('mkv'),
  defaultFormatPreset: z.string().default('bestvideo+bestaudio'),

  // Features
  enableMetrics: z.coerce.boolean().default(true),
  enableBullboard: z.coerce.boolean().default(false),
});

function loadConfig() {
  const envVars = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    redisUrl: process.env.REDIS_URL,
    dbPath: process.env.DB_PATH,
    mediaRoot: process.env.MEDIA_ROOT,
    minFreeSpaceGb: process.env.MIN_FREE_SPACE_GB,
    alertFreeSpaceGb: process.env.ALERT_FREE_SPACE_GB,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    downloadConcurrency: process.env.DOWNLOAD_CONCURRENCY,
    dubbingConcurrency: process.env.DUBBING_CONCURRENCY,
    muxingConcurrency: process.env.MUXING_CONCURRENCY,
    defaultTargetLang: process.env.TARGET_LANG,
    defaultContainer: process.env.DEFAULT_CONTAINER,
    defaultFormatPreset: process.env.DEFAULT_FORMAT_PRESET,
    enableMetrics: process.env.ENABLE_METRICS,
    enableBullboard: process.env.ENABLE_BULLBOARD,
  };

  const result = configSchema.safeParse(envVars);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
