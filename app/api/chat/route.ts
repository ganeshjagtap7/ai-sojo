import { streamText, stepCountIs } from 'ai';
import { getAIProvider } from '@/lib/ai/provider';
import { systemPrompt, updateSessionTool } from '@/lib/ai/conversation';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
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
