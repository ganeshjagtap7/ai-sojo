import { streamText, stepCountIs } from 'ai';
import { getAIProvider } from '@/lib/ai/provider';
import { systemPrompt, updateSessionTool } from '@/lib/ai/conversation';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/ratelimit';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(user.id);
  if (!allowed) {
    return Response.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const { messages } = await req.json();

  // Two steps: step 1 calls update_session to capture the user's answer for
  // the bucket they just filled; step 2 emits the next question's text.
  // (Going to stepCountIs(1) collapses both into a tool-only response and
  // the conversation stalls.) The doubled-text artifact is handled on the
  // client by resetting the text accumulator on each text-start event so we
  // render only the latest segment.
  const result = streamText({
    model: getAIProvider(),
    system: systemPrompt,
    messages,
    tools: { update_session: updateSessionTool },
    stopWhen: stepCountIs(2),
  });

  return result.toUIMessageStreamResponse();
}
