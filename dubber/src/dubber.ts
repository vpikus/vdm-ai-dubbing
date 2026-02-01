import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { publishLog, publishProgress, publishError } from './events.js';
import type { DubJobData } from './types.js';

// VOT.js is the unofficial client for Yandex Voice-Over Translation
// It works by sending video URLs to Yandex API which returns dubbed audio

// VOT.js responseLang (target TTS) supports: ru, en, kk
type VOTResponseLang = 'ru' | 'en' | 'kk';

// Supported language mappings
const SUPPORTED_LANGUAGES: Record<string, VOTResponseLang> = {
  ru: 'ru',
  russian: 'ru',
  en: 'en',
  english: 'en',
  kk: 'kk',
  kazakh: 'kk',
};

/**
 * Map target language codes to VOT.js supported response languages.
 * Throws an error for unsupported languages.
 */
function mapResponseLang(lang: string): VOTResponseLang {
  const langLower = lang.toLowerCase();
  const mapped = SUPPORTED_LANGUAGES[langLower];

  if (!mapped) {
    const supportedList = [...new Set(Object.values(SUPPORTED_LANGUAGES))].join(', ');
    throw new Error(
      `Unsupported dubbing language: "${lang}". VOT.js only supports: ${supportedList}. ` +
        `Please choose a supported target language.`
    );
  }

  return mapped;
}

/**
 * Perform voice-over translation on a video using VOT.js.
 * Uses the original video URL to request translation from Yandex API.
 */
export async function performDubbing(job: DubJobData): Promise<string> {
  const { jobId, url, targetLang, useLivelyVoice, outputPath } = job;

  console.log(`Starting dubbing for job ${jobId}`);
  await publishLog(jobId, 'info', `Starting dubbing to ${targetLang}`);
  await publishLog(jobId, 'info', `Video URL: ${url}`);

  try {
    // Dynamic imports for @vot.js/node
    const VOTClient = (await import('@vot.js/node')).default;
    const { getVideoData } = await import('@vot.js/node/utils/videoData');

    const client = new VOTClient();

    // Step 1: Get video data from URL
    await publishProgress(jobId, 'dubbing', 10);
    await publishLog(jobId, 'info', 'Fetching video data from URL...');

    const videoData = await getVideoData(url);

    if (!videoData) {
      throw new Error('Failed to get video data from URL');
    }

    console.log(`Video data retrieved: ${videoData.videoId}`);
    await publishLog(jobId, 'info', `Video ID: ${videoData.videoId}`);

    // Step 2: Request translation from Yandex VOT API using translateVideo
    // translateVideo is for pre-recorded videos (not live streams)
    await publishProgress(jobId, 'dubbing', 30);
    await publishLog(jobId, 'info', 'Requesting translation from Yandex VOT...');

    const responseLang = mapResponseLang(targetLang);

    await publishLog(jobId, 'info', `Target language: ${responseLang}`);

    // Use translateVideo for pre-recorded videos
    // Pass requestLang as undefined to let API auto-detect the source language
    let response = await client.translateVideo({
      videoData,
      responseLang: responseLang,
      extraOpts: {
          useLivelyVoice: useLivelyVoice,
      }
    });

    console.log('Initial translation response:', JSON.stringify(response, null, 2));

    // Poll until translation is complete
    let pollCount = 0;
    const maxPolls = 60; // Max 10 minutes (10 sec intervals)

    while (!response.translated && pollCount < maxPolls) {
      pollCount++;
      const waitTime = (response.remainingTime || 10) * 1000;
      console.log(`Translation in progress, waiting ${waitTime/1000}s... (attempt ${pollCount}/${maxPolls})`);
      await publishLog(jobId, 'info', `Waiting for translation... (${pollCount}/${maxPolls})`);
      await publishProgress(jobId, 'dubbing', 30 + Math.min(25, pollCount));

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Request again to check status
      response = await client.translateVideo({
        videoData,
        requestLang: undefined,
        responseLang,
      });
    }

    if (!response.translated || !response.url) {
      throw new Error(`Translation failed: ${response.message || 'timeout or no audio URL returned'}`);
    }

    const audioUrl = response.url;
    console.log(`Translation URL received: ${audioUrl}`);
    await publishLog(jobId, 'info', 'Translation audio URL received');

    // Step 3: Download the dubbed audio
    await publishProgress(jobId, 'dubbing', 60);
    await publishLog(jobId, 'info', 'Downloading dubbed audio...');

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Write dubbed audio to output path
    await writeFile(outputPath, audioBuffer);

    await publishProgress(jobId, 'dubbing', 100);
    await publishLog(jobId, 'info', `Dubbing complete: ${outputPath}`);

    console.log(`Dubbing complete for job ${jobId}: ${outputPath}`);
    return outputPath;
  } catch (err) {
    const error = err as Error;
    console.error(`Dubbing failed for job ${jobId}:`, error);

    await publishError(
      jobId,
      'DUBBING_ERROR',
      error.message,
      isRetryableError(error),
      error.stack
    );

    throw error;
  }
}

/**
 * Determine if an error is retryable.
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  const retryablePatterns = [
    'network',
    'timeout',
    'connection',
    'temporary',
    'unavailable',
    'rate limit',
    '429',
    '503',
    '502',
    'econnreset',
    'enotfound',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}
