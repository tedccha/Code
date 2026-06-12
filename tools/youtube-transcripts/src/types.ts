// Transcript state machine
export type TranscriptState = 'SUCCESS' | 'TRANSCRIBING' | 'FAILED';

// Transcript segments with timing information
export interface TranscriptSegment {
  text: string;
  offset: number; // milliseconds from start
}

// Raw transcript data
export interface TranscriptData {
  text: string; // Joined text with approximate timestamps
  segments: TranscriptSegment[];
}

// YouTube video metadata from oEmbed + YT API
export interface YoutubeMetadata {
  title?: string;
  channelName?: string;
  durationSeconds?: number;
  uploadDate?: string;
}

// Quality score dimensions (0-1 scale)
export interface QualityDimensions {
  relevance: number;
  depth: number;
  credibility: number;
  signal: number;
  clarity: number;
  actionability: number;
}

// Full quality score result with reasoning
export interface QualityScoreResult extends QualityDimensions {
  compositeScore: number;
  reasoning: string;
}

// Polling information for interim states
export interface PollingInfo {
  attemptCount: number;
  lastAttemptAt: Date;
  nextRetryAt?: Date; // Guidance for when to poll again
}

// Error details for failed state
export interface TranscriptError {
  message: string;
  code: 'INVALID_VIDEO_ID' | 'TRANSCRIPT_UNAVAILABLE' | 'QUALITY_SCORE_FAILED' | 'POLLING_TIMEOUT';
}

/**
 * Result of a YouTube transcript fetch operation.
 * Represents one of three states: SUCCESS, TRANSCRIBING, FAILED
 */
export interface TranscriptResult {
  state: TranscriptState;
  videoId: string;

  // Only populated when state === 'SUCCESS'
  transcript?: TranscriptData;

  // Optional metadata
  metadata?: YoutubeMetadata;

  // Optional quality score (if requested and available)
  qualityScore?: QualityScoreResult;

  // Polling info for TRANSCRIBING state
  polling?: PollingInfo;

  // Error details for FAILED state
  error?: TranscriptError;
}

// Configuration for quality scoring context (no Prisma queries)
export interface QualityScoringContext {
  title?: string;
  channelName?: string;
  sourceUrl?: string;
  author?: string;

  // Injected configuration (not from DB)
  weights?: QualityDimensions;
  interestDomains?: string[];
  tasteProfile?: string;
}

/**
 * Options for fetching a YouTube transcript
 */
export interface FetchTranscriptOptions {
  // Required: YouTube video ID or full URL
  videoId?: string;
  url?: string; // Full YouTube URL (used for oEmbed metadata)

  // Optional quality scoring
  includeQualityScore?: boolean;
  qualityScoreContext?: QualityScoringContext;

  // Polling behavior for async transcription (usetranscribe.io)
  maxPollingAttempts?: number; // default: 10
  pollingIntervalMs?: number; // default: 30000 (30 sec)
}

/**
 * Options for polling a transcript that returned TRANSCRIBING state
 */
export interface PollTranscriptOptions {
  maxAttempts?: number; // default: 10
  intervalMs?: number; // default: 30000 (30 sec)
}
