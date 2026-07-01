// Structured-output fallback for the generation routes.
//
// The routes ask Claude to return JSON as text and then parse it. That's fine for
// English, but multi-language output makes malformed JSON far more likely — the
// model wraps the object in translated prose, or (the real killer) emits an
// unescaped " or a raw newline inside a translated string value, so JSON.parse
// throws even after we've sliced out a balanced object.
//
// Rather than string-surgery the broken text (fragile), we let the model repair
// its own answer through TOOL USE: a forced tool call whose input the API itself
// serializes as JSON, so the result is guaranteed to be valid JSON. This runs
// ONLY when the fast text-parse fails, so the happy path costs nothing extra.
//
// Server-side only: imported by API route handlers.

import type Anthropic from '@anthropic-ai/sdk'

const EMIT_TOOL = {
  name: 'emit_json',
  description: 'Return the final result strictly as a JSON object.',
  input_schema: { type: 'object' as const, additionalProperties: true },
}

export type StructuredResult = {
  value: any
  inputTokens: number
  outputTokens: number
}

// Re-emits `priorAttempt` (the model's own malformed text answer) as a validated
// JSON object via a forced tool call. `system` is the route's original system
// prompt, so the model keeps the same shape and the same language rules.
export async function reEmitAsStructuredJson(
  client: Anthropic,
  model: string,
  system: string,
  priorAttempt: string,
  maxTokens = 4096,
): Promise<StructuredResult> {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [EMIT_TOOL] as any,
    tool_choice: { type: 'tool', name: 'emit_json' } as any,
    messages: [
      { role: 'user', content: 'Produce the final result.' },
      { role: 'assistant', content: priorAttempt || '(result follows)' },
      {
        role: 'user',
        content:
          'Return that exact result now by calling emit_json with the JSON object. ' +
          'Keep every JSON key and any fixed enum/code values in English; keep the free-text values in the language you already wrote them in.',
      },
    ],
  })

  const toolUse = res.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No structured tool output')
  }
  return {
    value: toolUse.input,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}
