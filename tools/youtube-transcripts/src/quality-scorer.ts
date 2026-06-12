import type { TranscriptData, QualityScoreResult, QualityScoringContext, QualityDimensions } from './types';

// Default quality weights
const DEFAULT_WEIGHTS: QualityDimensions = {
  relevance: 0.25,
  depth: 0.3,
  credibility: 0.25,
  signal: 0.1,
  clarity: 0.05,
  actionability: 0.05,
};

/**
 * Score the quality of a transcript text.
 * No Prisma dependencies — all config injected at call time.
 *
 * Steps:
 * 1. Summarize the transcript text (requires summarizeContent function)
 * 2. Score across 6 dimensions using LLM
 * 3. Compute composite score using weights
 *
 * Returns null if scoring fails (non-fatal).
 *
 * @param transcriptText Raw transcript text to score
 * @param context Quality scoring context with optional weights and interest domains
 * @param summarizeContent Function to summarize text (from consuming app)
 * @param qualityJudgeModel LLM model for quality scoring
 */
export async function scoreTranscriptQuality(
  transcriptText: string,
  context?: QualityScoringContext,
  summarizeContent?: (text: string, opts: any) => Promise<any>,
  qualityJudgeModel?: any
): Promise<QualityScoreResult | null> {
  if (!summarizeContent || !qualityJudgeModel) {
    console.warn('[youtube-transcripts/quality-scorer] Missing summarizeContent or qualityJudgeModel, skipping quality score');
    return null;
  }

  try {
    // Lazy import ai and zod only when needed
    const { generateObject } = await import('ai');
    const { z } = await import('zod');

    // Quality score schema
    const QualityScoreSchema = z.object({
      relevance: z.number().min(0).max(1).describe(
        '0=completely outside user interest areas, 1=core interest domain. Based on interest profile provided.'
      ),
      depth: z.number().min(0).max(1).describe(
        '0=surface-level summary/listicle, 1=deeply analytical original thinking with multi-step reasoning'
      ),
      credibility: z.number().min(0).max(1).describe(
        '0=anonymous unverifiable opinion, 1=named expert primary source with evidence or citations'
      ),
      signal: z.number().min(0).max(1).describe(
        '0=mostly filler/repetition/marketing language, 1=high insight density — every paragraph adds value'
      ),
      clarity: z.number().min(0).max(1).describe(
        '0=disorganized or unreadable, 1=well-structured clear writing that respects reader time'
      ),
      actionability: z.number().min(0).max(1).describe(
        '0=purely abstract with no practical application, 1=contains frameworks, decision criteria, or concrete how-tos'
      ),
      reasoning: z.string().describe(
        'One sentence explaining the composite score and what would make this higher or lower quality'
      ),
    });

    // Step 1: Summarize the transcript
    const summary = await summarizeContent(transcriptText, {
      knownTitle: context?.title,
      sourceType: 'YOUTUBE_VIDEO',
    });

    // Step 2: Score quality
    const weights = context?.weights ?? DEFAULT_WEIGHTS;
    const interestDomains = context?.interestDomains ?? ['General knowledge', 'Technology', 'Leadership', 'Business'];

    // Build prompt with context
    const promptLines = [
      context?.title ? `Title: ${context.title}` : '',
      context?.channelName ? `Channel: ${context.channelName}` : '',
      context?.sourceUrl ? `Source: ${context.sourceUrl}` : '',
      context?.author ? `Speaker: ${context.author}` : '',
      '',
      `Summary: ${summary.summary}`,
      '',
      `Key Points:\n${summary.keyPoints.map((p: string) => `• ${p}`).join('\n')}`,
    ].filter(Boolean);

    const systemPrompt = [
      `You are a quality judge for a personal knowledge library.`,
      `Score this content on 6 dimensions (0.0 to 1.0 each).`,
      '',
      `User's interest domains: ${interestDomains.join(', ')}`,
      context?.tasteProfile ? `\nUser taste profile: ${context.tasteProfile}` : '',
      '',
      `IMPORTANT: "novelty vs existing library" is NOT a dimension. Multiple strong sources on the same theme are valuable, not penalized.`,
      `Reward depth, credibility of author/source, and signal density even if the topic is well-covered.`,
    ].filter(Boolean);

    const { object } = await generateObject({
      model: qualityJudgeModel,
      schema: QualityScoreSchema,
      system: systemPrompt.join('\n'),
      prompt: promptLines.join('\n'),
    });

    const compositeScore = computeComposite(object, weights);

    return {
      ...object,
      compositeScore,
    };
  } catch (err) {
    console.error(`[youtube-transcripts/quality-scorer] Failed to score transcript:`, err);
    return null;
  }
}

/**
 * Compute weighted composite quality score.
 * All weights must sum to 1.0.
 */
export function computeComposite(scores: QualityDimensions, weights: QualityDimensions): number {
  const total =
    scores.relevance * weights.relevance +
    scores.depth * weights.depth +
    scores.credibility * weights.credibility +
    scores.signal * weights.signal +
    scores.clarity * weights.clarity +
    scores.actionability * weights.actionability;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, total));
}
