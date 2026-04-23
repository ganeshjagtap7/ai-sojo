import { streamText, stepCountIs } from 'ai';
import { getAIProvider } from '@/lib/ai/provider';
import { systemPrompt, updateSessionTool } from '@/lib/ai/conversation';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: getAIProvider(),
    system: systemPrompt,
    messages,
    tools: { update_session: updateSessionTool },
    stopWhen: stepCountIs(2),
  });

  return result.toUIMessageStreamResponse();
}
