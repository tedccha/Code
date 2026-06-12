/**
 * Standalone YouTube Transcript Service
 *
 * A reusable tool for fetching YouTube transcripts with optional quality scoring.
 * Supports async polling for videos that require transcription.
 *
 * No Prisma or app-specific dependencies.
 */

import type {
  FetchTranscriptOptions,
  PollTranscriptOptions,
  TranscriptResult,
  QualityScoreResult,
} from './types';

export * from './types';
export { scoreTranscriptQuality, computeComposite } from './quality-scorer';

// Import internal functions
import { fetchYoutubeTranscript as fetchFromPrimary } from './fetcher';
import { pollForTranscript as pollUsetranscribe } from './poller';
import { scoreTranscriptQuality } from './quality-scorer';

/**
 * Utility to extract YouTube video ID from various URL formats
 */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a YouTube transcript with optional async polling and quality scoring.
 *
 * Returns immediately with state:
 * - SUCCESS: transcript + metadata included
 * - TRANSCRIBING: polling info + nextRetryAt guidance
 * - FAILED: error details
 *
 * Use pollForTranscript() to retry TRANSCRIBING state.
 *
 * @example
 * const result = await fetchYoutubeTranscript({
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   includeQualityScore: true,
 *   qualityScoreContext: {
 *     interestDomains: ['AI', 'Product Management'],
 *   }
 * });
 */
export async function fetchYoutubeTranscript(options: FetchTranscriptOptions): Promise<TranscriptResult> {
  // Extract video ID from URL or use provided ID
  let videoId = options.videoId;
  const url = options.url;

  if (!videoId && !url) {
    return {
      state: 'FAILED',
      videoId: '',
      error: {
        message: 'Either videoId or url is required',
        code: 'INVALID_VIDEO_ID',
      },
    };
  }

  if (!videoId && url) {
    const extractedId = extractYouTubeId(url);
    if (!extractedId) {
      return {
        state: 'FAILED',
        videoId: url,
        error: {
          message: `Invalid YouTube URL: ${url}`,
          code: 'INVALID_VIDEO_ID',
        },
      };
    }
    videoId = extractedId;
  }

  try {
    // Fetch transcript (returns immediately or TRANSCRIBING state)
    const fetchResult = await fetchFromPrimary(videoId!, url);

    if (fetchResult.state !== 'SUCCESS') {
      return {
        ...fetchResult,
        videoId: videoId!,
      };
    }

    // Note: Quality scoring requires external dependencies (summarizeContent, LLM model)
    // Consuming applications should call scoreTranscriptQuality separately if needed

    return {
      ...fetchResult,
      videoId: videoId!,
    };
  } catch (err) {
    return {
      state: 'FAILED',
      videoId: videoId!,
      error: {
        message: `Failed to fetch transcript: ${err instanceof Error ? err.message : String(err)}`,
        code: 'TRANSCRIPT_UNAVAILABLE',
      },
    };
  }
}

/**
 * Continue polling for a transcript that returned TRANSCRIBING state.
 *
 * Safe to call repeatedly — returns immediately if already succeeded or failed.
 * Use nextRetryAt from the TRANSCRIBING result to time your polling.
 *
 * @example
 * let result = await fetchYoutubeTranscript({ url: 'https://youtube.com/watch?v=...' });
 *
 * if (result.state === 'TRANSCRIBING') {
 *   const delay = result.polling.nextRetryAt.getTime() - Date.now();
 *   await sleep(delay + 5000);
 *   result = await pollForTranscript(result.videoId);
 * }
 */
export async function pollForTranscript(
  videoId: string,
  options?: PollTranscriptOptions
): Promise<TranscriptResult> {
  try {
    return await pollUsetranscribe(videoId, options);
  } catch (err) {
    return {
      state: 'FAILED',
      videoId,
      error: {
        message: `Failed to poll transcript: ${err instanceof Error ? err.message : String(err)}`,
        code: 'POLLING_TIMEOUT',
      },
    };
  }
}
