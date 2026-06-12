import type { TranscriptResult, TranscriptData, YoutubeMetadata } from './types';

/**
 * In-memory cache for tracking transcript polling state.
 * Expired entries (older than 24h) are cleared periodically.
 */
interface CachedPollingState {
  state: 'SUCCESS' | 'TRANSCRIBING' | 'FAILED';
  result?: TranscriptResult;
  lastAttemptAt: Date;
  attemptCount: number;
}

// Map: videoId -> cached state
const pollingCache = new Map<string, CachedPollingState>();

// Clear expired entries every 5 minutes
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

setInterval(() => {
  const now = Date.now();
  for (const [videoId, state] of pollingCache.entries()) {
    if (now - state.lastAttemptAt.getTime() > CACHE_TTL) {
      pollingCache.delete(videoId);
    }
  }
}, CACHE_CLEANUP_INTERVAL);

/**
 * Poll for a YouTube transcript that returned TRANSCRIBING state.
 * Safe to call repeatedly — returns immediately if already succeeded or failed.
 *
 * Returns the latest state (SUCCESS, TRANSCRIBING, or FAILED).
 */
export async function pollForTranscript(
  videoId: string,
  options?: {
    maxAttempts?: number;
    intervalMs?: number;
  }
): Promise<TranscriptResult> {
  const maxAttempts = options?.maxAttempts ?? 10;
  const intervalMs = options?.intervalMs ?? 30000;

  // Check cache first
  const cached = pollingCache.get(videoId);
  if (cached?.state === 'SUCCESS' || cached?.state === 'FAILED') {
    // Already resolved, return cached result
    return cached.result!;
  }

  // Start polling
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try to fetch cached transcript from usetranscribe.io
      const segments = await fetchCachedTranscriptFromUsetranscribe(videoId);

      if (segments) {
        // Success! Cache the result
        const result: TranscriptResult = {
          state: 'SUCCESS',
          videoId,
          transcript: {
            text: formatTranscriptText(segments),
            segments,
          },
        };

        pollingCache.set(videoId, {
          state: 'SUCCESS',
          result,
          lastAttemptAt: new Date(),
          attemptCount: attempt + 1,
        });

        console.log(`[poller] Transcript found for ${videoId} after ${attempt + 1} attempt(s)`);
        return result;
      }

      // Not ready yet
      if (attempt < maxAttempts - 1) {
        const nextRetry = new Date(Date.now() + intervalMs);
        const cacheEntry: CachedPollingState = {
          state: 'TRANSCRIBING',
          result: {
            state: 'TRANSCRIBING',
            videoId,
            polling: {
              attemptCount: attempt + 1,
              lastAttemptAt: new Date(),
              nextRetryAt: nextRetry,
            },
          },
          lastAttemptAt: new Date(),
          attemptCount: attempt + 1,
        };

        pollingCache.set(videoId, cacheEntry);
        console.log(`[poller] Transcript not ready for ${videoId}, attempt ${attempt + 1}/${maxAttempts}, retrying in ${intervalMs}ms`);

        await sleep(intervalMs);
      }
    } catch (err) {
      console.error(`[poller] Attempt ${attempt + 1} failed for ${videoId}:`, err);
    }
  }

  // Polling exhausted
  const result: TranscriptResult = {
    state: 'FAILED',
    videoId,
    error: {
      message: `Polling timeout: transcript for ${videoId} not ready after ${maxAttempts} attempts`,
      code: 'POLLING_TIMEOUT',
    },
  };

  pollingCache.set(videoId, {
    state: 'FAILED',
    result,
    lastAttemptAt: new Date(),
    attemptCount: maxAttempts,
  });

  return result;
}

/**
 * Fetch a transcript if it's cached at usetranscribe.io.
 * Returns null if not cached (still transcribing or error).
 */
async function fetchCachedTranscriptFromUsetranscribe(
  videoId: string
): Promise<Array<{ text: string; offset: number }> | null> {
  try {
    const fetchRes = await fetch(`https://www.usetranscribe.io/yt/${videoId}?format=json`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!fetchRes.ok) {
      return null;
    }

    const data = (await fetchRes.json()) as { transcript?: { segments?: Array<{ text: string; offset: number }> } };
    const segments = data.transcript?.segments;

    if (segments && Array.isArray(segments) && segments.length > 0) {
      return segments;
    }

    return null;
  } catch (err) {
    console.error(`[poller] Error fetching from usetranscribe.io for ${videoId}:`, err);
    return null;
  }
}

/**
 * Format transcript segments into text with approximate timestamps.
 */
function formatTranscriptText(segments: Array<{ text: string; offset: number }>): string {
  const lines: string[] = [];
  let currentMinute = -1;

  for (const segment of segments) {
    const minute = Math.floor(segment.offset / 60000);
    if (minute !== currentMinute) {
      lines.push(`\n[${minute}:00]`);
      currentMinute = minute;
    }
    lines.push(segment.text);
  }

  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clear polling cache for a specific video (useful for testing or forced refresh).
 */
export function clearPollingCache(videoId?: string): void {
  if (videoId) {
    pollingCache.delete(videoId);
  } else {
    pollingCache.clear();
  }
}

/**
 * Get current polling state (useful for debugging).
 */
export function getPollingState(videoId: string): CachedPollingState | undefined {
  return pollingCache.get(videoId);
}
