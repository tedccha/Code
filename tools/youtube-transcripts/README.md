# YouTube Transcripts Tool

A standalone, Prisma-free tool for fetching YouTube transcripts with optional quality scoring and async polling support.

## Features

✅ **Dual sources:** `youtube-transcript` library + `usetranscribe.io` fallback  
✅ **Async polling:** Handle videos requiring 1-5 min transcription waits  
✅ **Optional quality scoring:** 6-dimension quality assessment without database queries  
✅ **Metadata fetching:** Video title & channel from oEmbed (no API key required)  
✅ **Zero Prisma deps:** Works standalone in any project  
✅ **Full TypeScript:** All types exported, fully typed API  

## Installation

### Local import (same machine):

```typescript
import { fetchYoutubeTranscript, pollForTranscript } from '../../../tools/youtube-transcripts/src';
```

### With path alias (recommended):

In your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@tools/*": ["../../tools/*"]
    }
  }
}
```

Then:

```typescript
import { fetchYoutubeTranscript, pollForTranscript } from '@tools/youtube-transcripts/src';
```

### From npm (future):

```bash
npm install @librarian/youtube-transcripts
```

```typescript
import { fetchYoutubeTranscript } from '@librarian/youtube-transcripts';
```

## Quick Start

### Fetch a transcript (immediate or polling):

```typescript
import { fetchYoutubeTranscript } from '@tools/youtube-transcripts/src';

const result = await fetchYoutubeTranscript({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
});

if (result.state === 'SUCCESS') {
  console.log('Transcript:', result.transcript.text);
  console.log('Duration ~', result.transcript.segments.length, 'segments');
} else if (result.state === 'TRANSCRIBING') {
  console.log('Transcription in progress, retry at:', result.polling.nextRetryAt);
} else {
  console.error('Failed:', result.error?.message);
}
```

### Poll for a transcript being generated:

```typescript
import { pollForTranscript } from '@tools/youtube-transcripts/src';

let result = await fetchYoutubeTranscript({ url: '...' });

if (result.state === 'TRANSCRIBING') {
  // Wait for guidance
  const delay = result.polling.nextRetryAt.getTime() - Date.now();
  await sleep(Math.max(delay, 30000)); // Add buffer, min 30s

  // Poll again
  result = await pollForTranscript(result.videoId, {
    maxAttempts: 20,
    intervalMs: 30000,
  });
}

if (result.state === 'SUCCESS') {
  console.log('Got transcript after waiting!');
}
```

## API Reference

### `fetchYoutubeTranscript(options)`

Fetch a YouTube transcript. Returns immediately with one of three states.

**Parameters:**

```typescript
{
  // Either videoId or url is required
  videoId?: string;              // e.g., "dQw4w9WgXcQ"
  url?: string;                  // Full YouTube URL

  // Polling options (for usetranscribe.io fallback)
  maxPollingAttempts?: number;   // default: 10
  pollingIntervalMs?: number;    // default: 30000 (30s)

  // Optional: include quality score
  includeQualityScore?: boolean;
  qualityScoreContext?: {
    title?: string;
    channelName?: string;
    sourceUrl?: string;
    author?: string;
    weights?: QualityDimensions;           // Custom weights for scoring
    interestDomains?: string[];            // e.g., ['AI', 'Product Management']
    tasteProfile?: string;                 // Free-form user profile
  };
}
```

**Returns:**

```typescript
{
  state: 'SUCCESS' | 'TRANSCRIBING' | 'FAILED';
  videoId: string;

  // Only if state === 'SUCCESS'
  transcript?: {
    text: string;        // Full text with [MM:SS] timestamps
    segments: Array<{
      text: string;
      offset: number;    // milliseconds
    }>;
  };

  metadata?: {
    title?: string;
    channelName?: string;
    durationSeconds?: number;
    uploadDate?: string;
  };

  qualityScore?: {
    relevance: number;
    depth: number;
    credibility: number;
    signal: number;
    clarity: number;
    actionability: number;
    compositeScore: number;
    reasoning: string;
  };

  // Only if state === 'TRANSCRIBING'
  polling?: {
    attemptCount: number;
    lastAttemptAt: Date;
    nextRetryAt: Date;   // Suggested time to poll again
  };

  // Only if state === 'FAILED'
  error?: {
    message: string;
    code: 'INVALID_VIDEO_ID' | 'TRANSCRIPT_UNAVAILABLE' | 'QUALITY_SCORE_FAILED' | 'POLLING_TIMEOUT';
  };
}
```

### `pollForTranscript(videoId, options?)`

Continue polling for a transcript that returned `TRANSCRIBING` state.

Safe to call repeatedly—returns immediately if already resolved.

**Parameters:**

```typescript
videoId: string;
options?: {
  maxAttempts?: number;   // default: 10
  intervalMs?: number;    // default: 30000 (30s)
}
```

**Returns:** `TranscriptResult` (same as `fetchYoutubeTranscript`)

### `scoreTranscriptQuality(transcriptText, context?, summarizeContent, qualityJudgeModel)`

Score a transcript on 6 quality dimensions.

**Note:** This requires the consuming application to provide:
- `summarizeContent(text, opts)` — Function to summarize text
- `qualityJudgeModel` — LLM model (from `ai` SDK)

The tool is **Prisma-free**, so quality config is injected at call time (no database queries).

```typescript
import { scoreTranscriptQuality } from '@tools/youtube-transcripts/src';
import { summarizeContent } from '@/lib/pipeline/summarizer'; // your app's function
import { MODELS } from '@/lib/ai'; // your app's model

const score = await scoreTranscriptQuality(
  transcript.text,
  {
    title: 'Video Title',
    interestDomains: ['AI', 'Product Management'],
    weights: {
      relevance: 0.3,
      depth: 0.3,
      credibility: 0.2,
      signal: 0.1,
      clarity: 0.05,
      actionability: 0.05,
    },
  },
  summarizeContent,
  MODELS.qualityJudge
);

console.log('Quality score:', score?.compositeScore);
```

## Behavior & Guarantees

### State Machine

```
                    ┌─────────────────┐
                    │   INITIAL       │
                    │ (call function) │
                    └────────┬────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
   ┌────────┐         ┌──────────────┐      ┌────────┐
   │SUCCESS │         │TRANSCRIBING  │      │ FAILED │
   │        │         │              │      │        │
   └────────┘         │ (polling...) │      └────────┘
                      └──────┬───────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
               ┌────────┐        ┌────────┐
               │SUCCESS │        │ FAILED │
               │        │        │        │
               └────────┘        └────────┘
```

### Async Polling Guarantees

- **Immediate return:** No blocking on transcription. Function returns quickly with state.
- **Polling guidance:** `TRANSCRIBING` state includes `nextRetryAt`—retry at that time.
- **Cached state:** Polling state is cached for 24 hours in-memory.
- **Idempotent:** Safe to call `pollForTranscript` multiple times for the same video.
- **Auto-cleanup:** Entries expire after 24 hours or when resolved (SUCCESS/FAILED).

### Fallback Logic

1. **Primary:** Try `youtube-transcript` library (works for videos with public captions)
2. **Fallback:** If primary fails, trigger `usetranscribe.io` transcription
   - If already cached: return `SUCCESS` with transcript
   - If not cached: return `TRANSCRIBING`, trigger async transcription
   - Caller polls later when ready

### Quality Scoring

- **Context injection:** No database queries inside tool—all config passed at call time
- **Summarization required:** Quality scoring needs a `summarizeContent` function from consuming app
- **Weights customizable:** Pass custom quality weights, interest domains, taste profile
- **Non-blocking:** Quality scoring is optional and can fail gracefully (returns `null`)

## Examples

### Complete flow with quality scoring:

```typescript
import { fetchYoutubeTranscript, pollForTranscript } from '@tools/youtube-transcripts/src';

async function ingestYouTubeVideo(url: string, userInterests: string[]) {
  // Fetch transcript
  let result = await fetchYoutubeTranscript({
    url,
    includeQualityScore: true,
    qualityScoreContext: {
      interestDomains: userInterests,
      weights: {
        relevance: 0.3,
        depth: 0.3,
        credibility: 0.2,
        signal: 0.1,
        clarity: 0.05,
        actionability: 0.05,
      },
    },
  });

  // Handle TRANSCRIBING state
  if (result.state === 'TRANSCRIBING') {
    console.log(`Transcript being generated, will check again in ${result.polling.nextRetryAt}`);

    // Schedule a retry (your app's job queue / cron)
    scheduleRetry(result.videoId, result.polling.nextRetryAt);
    return;
  }

  if (result.state === 'FAILED') {
    console.error('Transcript unavailable:', result.error?.message);
    return;
  }

  // Process successful transcript
  console.log('Title:', result.metadata?.title);
  console.log('Quality:', result.qualityScore?.compositeScore);
  console.log('Transcript:', result.transcript.text);

  // Store in database, feed to downstream pipeline, etc.
}
```

### Polling retry handler:

```typescript
import { pollForTranscript } from '@tools/youtube-transcripts/src';

async function retryTranscriptPolling(videoId: string) {
  const result = await pollForTranscript(videoId, {
    maxAttempts: 30,
    intervalMs: 30000, // 30 seconds between attempts
  });

  if (result.state === 'SUCCESS') {
    console.log('Transcript ready!');
    // Process transcript, update database, etc.
  } else if (result.state === 'TRANSCRIBING') {
    console.log('Still transcribing, will retry later');
  } else {
    console.error('Transcription failed:', result.error?.message);
  }
}
```

## Development

### Build:

```bash
cd ~/Code/tools/youtube-transcripts
npm run build
```

### Test (future):

```bash
npm test
```

### Integration with consuming project:

```bash
# In your project (e.g., the-librarian)
npm run build  # re-imports and rebuilds
```

## Dependencies

- **`youtube-transcript`** (1.0.6+) — Fetches captions from YouTube videos
- **`ai`** (4.0.0+) — For quality scoring LLM calls
- **`zod`** (3.22.0+) — Schema validation for quality scores
- **`fetch`** (builtin) — Network requests to oEmbed, usetranscribe.io

No Prisma, no framework assumptions.

## Limitations

- **Manual polling:** Caller manages retry logic. No background job runner.
- **No voice transcription:** Only works for videos with captions (youtube-transcript) or usetranscribe.io
- **Usetranscribe rate limits:** May be rate-limited if too many concurrent requests
- **Quality scoring external:** Requires consuming app's `summarizeContent` + LLM model
- **In-memory polling cache:** State lost on process restart (acceptable for most use cases)

## Status

**Stable** — Used in production by the-librarian. Breaking changes unlikely; semantic versioning observed.

## Contributing

- Update version in `package.json`
- Add entry to `~/.claude/organizer/registry.json` with new version
- Build and test before committing
- Document any API changes in this README

---

**Last updated:** 2026-06-12  
**Current version:** 1.0.0
