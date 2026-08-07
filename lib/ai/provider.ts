import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * The pipeline steps that call a model. 'query' and 'enrich' are high-volume
 * and mechanical, so they may run on a cheaper model via AI_MODEL_FAST; the
 * quality-visible steps (rank, thesis, chat, refine) always use AI_MODEL.
 *
 * Env rollout (Vercel):
 *   AI_MODEL=claude-sonnet-5        ← main model, all quality steps
 *   AI_MODEL_FAST=claude-haiku-4-5  ← optional; query gen + enrichment batches
 *   ANTHROPIC_API_KEY=...           ← required for any claude* model
 * With none of these set, everything runs on gpt-4o exactly as before.
 */
export type AIStep = 'query' | 'enrich' | 'rank' | 'thesis' | 'chat' | 'refine';

const FAST_STEPS: ReadonlySet<AIStep> = new Set(['query', 'enrich']);

export function getAIProvider(step?: AIStep) {
  const base = process.env.AI_MODEL || 'gpt-4o';
  const fast = process.env.AI_MODEL_FAST || base;
  const model = step && FAST_STEPS.has(step) ? fast : base;

  if (model.startsWith('claude')) {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return anthropic(model);
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return openai(model);
}

// Hard per-call timeout for model requests (via AbortSignal.timeout). A stalled
// provider must not hang the search pipeline unbounded and breach the route's
// maxDuration — a timed-out call is treated as that call's failure and degrades
// gracefully (un-enriched / un-ranked / fallback queries) by its caller.
export const AI_CALL_TIMEOUT_MS = 60_000;
