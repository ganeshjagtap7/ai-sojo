import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIProvider } from './provider';
import type { Archetype, Buckets, Facts, Thesis } from '@/lib/flow/types';

const thesisPrompt = readFileSync(
  join(process.cwd(), 'prompts/thesis.md'),
  'utf-8'
);

export async function generateThesis(input: {
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
}): Promise<Thesis> {
  const userContent = JSON.stringify(input, null, 2);

  try {
    const { text } = await generateText({
      model: getAIProvider(),
      system: thesisPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    // Tolerant extractor: grab the outermost JSON object. Survives markdown fences, prose preambles, trailing notes.
    const match = text.match(/\{[\s\S]*\}/);
    const cleaned = match ? match[0] : text.trim();

    const parsed = JSON.parse(cleaned);
    return {
      paragraph: String(parsed.paragraph ?? ''),
      sharpening: String(parsed.sharpening ?? ''),
      disqualifiers: Array.isArray(parsed.disqualifiers) ? parsed.disqualifiers.map(String) : [],
      headline: String(parsed.headline ?? ''),
      archetypeLabel: String(parsed.archetypeLabel ?? ''),
      flag: parsed.flag == null ? null : String(parsed.flag),
    };
  } catch (err) {
    console.error('[thesis] fallback triggered:', err);
    return fallbackThesis(input);
  }
}

const ARCHETYPE_LABELS: Record<string, string> = {
  monopoly: 'Local monopoly',
  consolidator: 'Consolidator',
  operator: 'Operator upgrade',
  upgrade: 'Operator upgrade',
  quiet: 'Quiet moat',
  moat: 'Quiet moat',
};

function normalizeArchetypeLabel(raw: string): string {
  const k = raw.toLowerCase();
  for (const key of Object.keys(ARCHETYPE_LABELS)) {
    if (k.includes(key)) return ARCHETYPE_LABELS[key];
  }
  return 'Consolidator';
}

function fallbackThesis({ archetype, facts, buckets }: {
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
}): Thesis {
  const geo = (facts.geo || ['Southeast']).join(' + ');
  const shape = buckets.archetype || 'A searcher-sized business';
  const moat = buckets.stickiness || 'meaningful switching cost';
  const disq = buckets.disqualifier || 'customer concentration above 40%';
  const vision = buckets.vision || 'compounded, calm, worth running';
  const horizon = facts.horizon ?? 'held long';
  return {
    headline: `A ${shape.toLowerCase()} play in ${geo}, ${horizon}.`,
    archetypeLabel: normalizeArchetypeLabel(shape),
    paragraph: `You are looking for ${shape.toLowerCase()} in ${geo}, writing ${facts.check ?? '$3–10M'} of equity with a ${horizon} horizon. The moat you care about is ${moat}. You walk away if ${disq}. In five years: ${vision}.`,
    sharpening: `You refined your opening take into something testable by session's end.`,
    disqualifiers: [
      disq,
      'Owner unwilling to entertain an 18-month transition',
      'Workforce concentration that collapses the business if a 2-person crew walks',
      'Regulatory moat dependent on a personal certification held by the seller',
    ],
    flag: null,
  };
}
