import { z } from 'zod';

// Shape of the FlowState slice the onboarding handoff persists via /api/onboard.
// We only accept the fields the user actually generated; everything else is
// dropped. Shared with the route so it's unit-testable without the route's
// server-only imports (supabase / next headers).
//
// NOTE: `archetype` and `thesis` MUST be `.nullable()` — the persisted FlowState
// carries `archetype: null` / `thesis: null` until the wizard fills them, and a
// new user hits the handoff before that. Zod v4 `.optional()` allows `undefined`
// but NOT `null`, so without `.nullable()` every new signup 400'd ("Invalid
// payload"). Null now validates and the route treats it as a no-op.
export const OnboardSchema = z.object({
  archetype: z
    .object({ id: z.string().optional(), name: z.string().optional() })
    .nullable()
    .optional(),
  facts: z.record(z.string(), z.unknown()).optional(),
  buckets: z.record(z.string(), z.unknown()).optional(),
  thesis: z
    .object({
      headline: z.string().optional(),
      paragraph: z.string().optional(),
      sharpening: z.string().optional(),
      disqualifiers: z.array(z.string()).optional(),
      archetypeLabel: z.string().optional(),
      flag: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type OnboardPayload = z.infer<typeof OnboardSchema>;
