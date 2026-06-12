import type { TranscriptData, YoutubeMetadata, TranscriptResult, TranscriptError } from './types';

/**
 * Fetch a YouTube transcript directly from youtube-transcript library.
 * Falls back to usetranscribe.io if primary source fails.
 *
 * Returns:
 * - {SUCCESS, transcript, metadata}: transcript found and ready
 * - {TRANSCRIBING, polling}: primary failed, usetranscribe.io triggered async transcription
 * - {FAILED, error}: both sources exhausted
 */
export async function fetchYoutubeTranscript(
  videoId: string,
  url?: string
): Promise<Omit<TranscriptResult, 'videoId'>> {
  // Try primary source: youtube-transcript library
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const segments = await YoutubeTranscript.fetchTranscript(videoId);

    // Fetch metadata in parallel
    const metadata = await fetchYouTubeMetadata(url || `https://www.youtube.com/watch?v=${videoId}`);

    const transcript = {
      text: formatTranscriptText(segments),
      segments,
    };

    return {
      state: 'SUCCESS',
      transcript,
      metadata,
    };
  } catch (primaryErr) {
    console.log(`[youtube-transcripts] youtube-transcript failed for ${videoId}: ${primaryErr}, trying usetranscribe.io`);
  }

  // Fallback: check usetranscribe.io cache and trigger async if needed
  try {
    const fallbackResult = await checkAndTriggerUsetranscribe(videoId);

    if (fallbackResult.state === 'SUCCESS') {
      // Transcript already cached at usetranscribe.io
      const metadata = await fetchYouTubeMetadata(url || `https://www.youtube.com/watch?v=${videoId}`);
      return {
        state: 'SUCCESS',
        transcript: fallbackResult.transcript,
        metadata,
      };
    } else {
      // Transcription triggered, return TRANSCRIBING state
      return fallbackResult;
    }
  } catch (fallbackErr) {
    const error: TranscriptError = {
      message: `YouTube transcript unavailable for ${videoId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
      code: 'TRANSCRIPT_UNAVAILABLE',
    };

    return {
      state: 'FAILED',
      error,
    };
  }
}

/**
 * Check if a transcript is cached at usetranscribe.io.
 * If cached, fetch and return it.
 * If not cached, trigger transcription and return TRANSCRIBING state.
 */
async function checkAndTriggerUsetranscribe(videoId: string): Promise<Omit<TranscriptResult, 'videoId' | 'metadata'>> {
  try {
    // Step 1: Check if cached
    const checkRes = await fetch(`https://www.usetranscribe.io/api/check?platform=youtube&id=${videoId}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!checkRes.ok) {
      throw new Error(`usetranscribe check failed: ${checkRes.status}`);
    }

    // Step 2: Try to fetch cached transcript
    const fetchRes = await fetch(`https://www.usetranscribe.io/yt/${videoId}?format=json`, {
      signal: AbortSignal.timeout(10000),
    });

    if (fetchRes.ok) {
      // Cached transcript found
      const data = (await fetchRes.json()) as { transcript?: { segments?: Array<{ text: string; offset: number }> } };
      const segments = data.transcript?.segments;

      if (segments && Array.isArray(segments)) {
        console.log(`[youtube-transcripts] Got ${segments.length} segments from usetranscribe.io for ${videoId}`);
        return {
          state: 'SUCCESS',
          transcript: {
            text: formatTranscriptText(segments),
            segments,
          },
        };
      }
    }

    // Step 3: Not cached — trigger transcription
    console.log(`[youtube-transcripts] Transcript not cached for ${videoId}, triggering usetranscribe transcription...`);
    const transcribeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const triggerRes = await fetch(`https://www.usetranscribe.io/transcribe?url=${encodeURIComponent(transcribeUrl)}&summarize=1`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!triggerRes.ok && triggerRes.status !== 429) {
      // 429 means rate limited, which is expected. Other errors should fail.
      throw new Error(`Failed to trigger transcription: ${triggerRes.status}`);
    }

    console.log(`[youtube-transcripts] Transcription triggered for ${videoId}, will retry in a few minutes`);

    // Return TRANSCRIBING state with polling guidance
    return {
      state: 'TRANSCRIBING',
      polling: {
        attemptCount: 1,
        lastAttemptAt: new Date(),
        nextRetryAt: new Date(Date.now() + 30000), // Suggest retry in 30s
      },
    };
  } catch (err) {
    throw new Error(`usetranscribe.io fallback failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fetch YouTube video metadata via oEmbed (no API key required).
 * Returns null on any error — transcript is still usable without it.
 */
async function fetchYouTubeMetadata(url: string): Promise<YoutubeMetadata | undefined> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oEmbedUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;

    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title) return undefined;

    return {
      title: data.title,
      channelName: data.author_name || undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Format transcript segments into text with approximate timestamps.
 * Adds [MM:SS] markers every 60 seconds.
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
